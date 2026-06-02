/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { doc, setDoc, deleteDoc, updateDoc, arrayUnion, db, handleFirestoreError, OperationType } from "../firebase";
import { Employee, Task } from "../types";
import { UserPlus, UserMinus, AlertTriangle, CheckCircle, ShieldAlert, Edit, X, Check, History, ChevronDown, ChevronUp, Calendar, Clock } from "lucide-react";

interface TeamManagementProps {
  personnel: Employee[];
  onRefresh: () => void;
  currentUserEmail?: string;
  auditLogs?: any[];
  onFocusTask?: (pId: number, tId: number, date: Date) => void;
}

export default function TeamManagement({
  personnel,
  onRefresh,
  currentUserEmail,
  auditLogs = [],
  onFocusTask,
}: TeamManagementProps) {
  const [activeDept, setActiveDept] = useState<"eng" | "qual" | "logs">("eng");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States for reassignment flow
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>("");
  const [showReassignModal, setShowReassignModal] = useState(false);

  // States for inline role editing
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState("");

  // States for expanding employee unfinished task details
  const [expandedEmps, setExpandedEmps] = useState<Record<number, boolean>>({});

  const formatTaskDate = (d: any): string => {
    if (!d) return "N/A";
    try {
      const dateObj = d.toDate ? d.toDate() : new Date(d);
      return dateObj.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (err) {
      return "N/A";
    }
  };

  const toggleEmpExpanded = (empId: number) => {
    setExpandedEmps((prev) => ({
      ...prev,
      [empId]: !prev[empId],
    }));
  };

  const handleUpdateRole = async (emp: Employee, newRoleText: string) => {
    const formattedRole = newRoleText.trim();
    if (!formattedRole) {
      setErrorMsg("Role description cannot be empty.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg("");

    try {
      const empRef = doc(db, "personnel", String(emp.id));
      await updateDoc(empRef, {
        info: {
          id: emp.id,
          name: emp.name,
          dept: emp.dept,
          role: formattedRole,
        },
      });

      // Log audit action
      const operator = currentUserEmail ? currentUserEmail.split("@")[0].toUpperCase() : "SYSTEM";
      const timestamp = new Date().toISOString();
      try {
        const auditRef = doc(db, "config", "audit_logs");
        await updateDoc(auditRef, {
          logs: arrayUnion({
            id: `${Date.now()}-${Math.random()}`,
            date: timestamp,
            operator,
            empName: emp.name,
            action: "ROLE_CHANGED",
            details: `Changed role from "${emp.role}" to "${formattedRole}"`,
          }),
        });
      } catch (logErr) {
        console.error("Failed to write personnel audit log:", logErr);
      }

      setSuccessMsg(`Successfully updated role for ${emp.name} to "${formattedRole}"!`);
      setEditingEmpId(null);
      setEditingRoleValue("");
      onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/${emp.id}`);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg("");

    if (!newName.trim() || !newRole.trim()) {
      setErrorMsg("Please fill in both Name and Role.");
      return;
    }

    try {
      // Find a unique ID
      const newId = Date.now();
      const newEmployee: Employee = {
        id: newId,
        name: newName.trim(),
        role: newRole.trim(),
        dept: activeDept,
        tasks: [],
      };

      const path = `personnel/${newId}`;
      await setDoc(doc(db, "personnel", String(newId)), {
        info: {
          id: newEmployee.id,
          name: newEmployee.name,
          role: newEmployee.role,
          dept: newEmployee.dept,
        },
        tasks: [],
      });

      // Log audit action
      const operator = currentUserEmail ? currentUserEmail.split("@")[0].toUpperCase() : "SYSTEM";
      const timestamp = new Date().toISOString();
      try {
        const auditRef = doc(db, "config", "audit_logs");
        await updateDoc(auditRef, {
          logs: arrayUnion({
            id: `${Date.now()}-${Math.random()}`,
            date: timestamp,
            operator,
            empName: newEmployee.name,
            action: "EMPLOYEE_ADDED",
            details: `Added as a new member of the ${newEmployee.dept === "eng" ? "Engineering" : "Quality"} department with role "${newEmployee.role}"`,
          }),
        });
      } catch (logErr) {
        console.error("Failed to write personnel audit log:", logErr);
      }

      setSuccessMsg(`Successfully added ${newEmployee.name} to the team!`);
      setNewName("");
      setNewRole("");
      onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/new`);
    }
  };

  const startDeleteEmployee = (emp: Employee) => {
    setErrorMsg(null);
    setSuccessMsg("");
    const unfinished = emp.tasks.filter((t) => !t.completed && !t.isDone);

    if (unfinished.length > 0) {
      const peers = personnel.filter((p) => p.dept === emp.dept && p.id !== emp.id);
      if (peers.length === 0) {
        setErrorMsg(
          `Cannot remove ${emp.name} because they have ${unfinished.length} unfinished tasks and there are no other team members in the ${emp.dept === "eng" ? "Engineering" : "Quality"} department to reassign tasks to.`
        );
        return;
      }
      setDeletingEmployee(emp);
      setReassignTargetId(String(peers[0].id));
      setShowReassignModal(true);
    } else {
      if (window.confirm(`Are you sure you want to remove ${emp.name}?`)) {
        finishDeleteEmployee(emp, null);
      }
    }
  };

  const finishDeleteEmployee = async (emp: Employee, reassignToId: number | null) => {
    try {
      const unfinished = emp.tasks.filter((t) => !t.completed && !t.isDone);

      if (reassignToId !== null && unfinished.length > 0) {
        const targetEmployee = personnel.find((p) => p.id === reassignToId);
        if (!targetEmployee) {
          setErrorMsg("Selected target team member was not found.");
          return;
        }

        const reassigner = currentUserEmail ? currentUserEmail.split("@")[0].toUpperCase() : "SYSTEM";

        // Prepare reassigned tasks
        const reassignedTasks: Task[] = unfinished.map((t, idx) => ({
          ...t,
          id: Date.now() + idx + Math.round(Math.random() * 1000), // Assign a fresh unique ID
          history: [
            ...(t.history || []),
            {
              date: new Date(),
              action: `Reassigned from ${emp.name} by ${reassigner}`,
            },
          ],
        }));

        // Add to standard Firestore
        const targetRef = doc(db, "personnel", String(reassignToId));
        const updatedTargetTasks = [...targetEmployee.tasks, ...reassignedTasks];
        await updateDoc(targetRef, { tasks: updatedTargetTasks });
      }

      // Delete the employee doc
      await deleteDoc(doc(db, "personnel", String(emp.id)));

      // Log audit action
      const operator = currentUserEmail ? currentUserEmail.split("@")[0].toUpperCase() : "SYSTEM";
      const timestamp = new Date().toISOString();
      try {
        const auditRef = doc(db, "config", "audit_logs");
        let reassignDetails = "None";
        if (reassignToId !== null && unfinished.length > 0) {
          const targetEmployee = personnel.find((p) => p.id === reassignToId);
          reassignDetails = targetEmployee ? `Reassigned ${unfinished.length} tasks to ${targetEmployee.name}` : `Reassigned ${unfinished.length} tasks`;
        }
        await updateDoc(auditRef, {
          logs: arrayUnion({
            id: `${Date.now()}-${Math.random()}`,
            date: timestamp,
            operator,
            empName: emp.name,
            action: "EMPLOYEE_REMOVED",
            details: `Removed from the ${emp.dept === "eng" ? "Engineering" : "Quality"} department. Outstanding obligations: ${reassignDetails}`,
          }),
        });
      } catch (logErr) {
        console.error("Failed to write personnel audit log:", logErr);
      }

      setSuccessMsg(
        `Successfully removed ${emp.name}.${
          reassignToId !== null && unfinished.length > 0
            ? ` Reassigned ${unfinished.length} unfinished tasks.`
            : ""
        }`
      );
      setShowReassignModal(false);
      setDeletingEmployee(null);
      onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `personnel/${emp.id}`);
    }
  };

  const deptMembers = activeDept !== "logs" ? personnel.filter((p) => p.dept === activeDept) : [];

  const isAllExpanded = deptMembers.length > 0 && deptMembers.every((emp) => {
    const unfinished = emp.tasks.filter((t) => !t.completed && !t.isDone);
    if (unfinished.length === 0) return true;
    return !!expandedEmps[emp.id];
  });

  const toggleAllExpanded = () => {
    if (isAllExpanded) {
      setExpandedEmps({});
    } else {
      const nextExpanded: Record<number, boolean> = {};
      deptMembers.forEach((emp) => {
        const unfinished = emp.tasks.filter((t) => !t.completed && !t.isDone);
        if (unfinished.length > 0) {
          nextExpanded[emp.id] = true;
        }
      });
      setExpandedEmps(nextExpanded);
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {successMsg && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-xl flex items-center shadow-xs">
          <CheckCircle className="text-green-500 mr-3 h-5 w-5" />
          <p className="text-sm font-semibold text-green-800">{successMsg}</p>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl flex items-start shadow-xs">
          <ShieldAlert className="text-red-500 mr-3 h-5 w-5 mt-0.5" />
          <p className="text-sm font-semibold text-red-800">{errorMsg}</p>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => {
            setActiveDept("eng");
            setErrorMsg(null);
            setSuccessMsg("");
          }}
          className={`py-3 px-6 font-bold text-sm tracking-wide border-b-2 transition-all cursor-pointer ${
            activeDept === "eng"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Engineering Team Directory
        </button>
        <button
          onClick={() => {
            setActiveDept("qual");
            setErrorMsg(null);
            setSuccessMsg("");
          }}
          className={`py-3 px-6 font-bold text-sm tracking-wide border-b-2 transition-all cursor-pointer ${
            activeDept === "qual"
              ? "border-purple-600 text-purple-600 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Quality Team Directory
        </button>
        <button
          onClick={() => {
            setActiveDept("logs");
            setErrorMsg(null);
            setSuccessMsg("");
          }}
          className={`py-3 px-6 font-bold text-sm tracking-wide border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeDept === "logs"
              ? "border-amber-600 text-amber-600 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <History className="h-4 w-4" />
          Personnel Change Audit Logs
        </button>
      </div>

      {activeDept === "logs" ? (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <History className="text-amber-600 mr-2 h-5 w-5" />
              Personnel Action Audit Trail
            </h3>
            <p className="text-xs text-gray-500 font-semibold mt-1">
              Historical timeline of human resource changes including registry additions, staff removals, and title/role modifications.
            </p>
          </div>

          {!auditLogs || auditLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 font-semibold italic bg-gray-50 border border-gray-150 rounded-xl">
              No personnel change activity logs have been recorded yet. Update an employee's title or register a new team member to start tracking changes.
            </div>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-extrabold tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-left">Timestamp</th>
                    <th className="px-6 py-3 text-left">Employee Name</th>
                    <th className="px-6 py-3 text-left">Action</th>
                    <th className="px-6 py-3 text-left">Modifications &amp; Details</th>
                    <th className="px-6 py-3 text-right">Modified By</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 font-medium">
                  {[...auditLogs]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-bold font-mono">
                          {new Date(log.date).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-black uppercase">
                          {log.empName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`text-[10px] px-2.5 py-1 rounded-full font-extrabold uppercase border ${
                              log.action === "ROLE_CHANGED"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : log.action === "EMPLOYEE_ADDED"
                                  ? "bg-green-50 border-green-200 text-green-700"
                                  : "bg-red-50 border-red-200 text-red-700"
                            }`}
                          >
                            {log.action.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-700 text-xs leading-relaxed font-bold">
                          {log.details}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 uppercase">
                            {log.operator || "SYSTEM"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form panel */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs h-fit">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <UserPlus className={`mr-2 h-5 w-5 ${activeDept === "eng" ? "text-blue-600" : "text-purple-600"}`} />
            Add New Employee
          </h3>
          <form onSubmit={handleAddEmployee} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Name
              </label>
              <input
                type="text"
                placeholder="First Last"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Role Description
              </label>
              <input
                type="text"
                placeholder="e.g. Eng 4 or Quality Tech"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Department
              </span>
              <div className="flex gap-4">
                <label className="flex items-center text-sm font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={activeDept === "eng"}
                    onChange={() => setActiveDept("eng")}
                    className="mr-2"
                  />
                  Engineering
                </label>
                <label className="flex items-center text-sm font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={activeDept === "qual"}
                    onChange={() => setActiveDept("qual")}
                    className="mr-2"
                  />
                  Quality
                </label>
              </div>
            </div>
            <button
              type="submit"
              className={`w-full py-2.5 rounded-lg text-sm font-bold text-white transition-colors cursor-pointer ${
                activeDept === "eng" ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              Add to {activeDept === "eng" ? "Engineering" : "Quality"}
            </button>
          </form>
        </div>

        {/* Members Directory */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Current {activeDept === "eng" ? "Engineering" : "Quality"} Staff
              </h3>
              <button
                type="button"
                onClick={toggleAllExpanded}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 flex items-center justify-center gap-1.5 shadow-3xs cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5 text-gray-500" />
                {isAllExpanded ? "Collapse All Tasks" : "Expand All Tasks"}
              </button>
            </div>
            {deptMembers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                No active employee directory listings. Use the left panel to register staff.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {deptMembers.map((emp) => {
                  const unfinished = emp.tasks.filter((t) => !t.completed && !t.isDone);
                  const isExpanded = !!expandedEmps[emp.id];
                  return (
                    <div
                      key={emp.id}
                      className="border border-gray-250 hover:border-gray-300 rounded-xl p-4 bg-gray-50 flex flex-col gap-3 transition-all"
                    >
                      <div className="flex justify-between items-start w-full gap-2 font-sans">
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm uppercase">{emp.name}</h4>
                          {editingEmpId === emp.id ? (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingRoleValue}
                                onChange={(e) => setEditingRoleValue(e.target.value)}
                                className="px-2 py-1 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-700 w-44 font-sans"
                                placeholder="New Role Description"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleUpdateRole(emp, editingRoleValue);
                                  } else if (e.key === "Escape") {
                                    setEditingEmpId(null);
                                    setEditingRoleValue("");
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateRole(emp, editingRoleValue)}
                                className="p-1 px-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md font-bold transition-all cursor-pointer flex items-center justify-center"
                                title="Save new role"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmpId(null);
                                  setEditingRoleValue("");
                                }}
                                className="p-1 px-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md font-bold transition-all cursor-pointer flex items-center justify-center"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-2 group/role">
                              <p className="text-xs text-gray-500 font-bold">{emp.role}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmpId(emp.id);
                                  setEditingRoleValue(emp.role);
                                }}
                                className="opacity-75 md:opacity-0 md:group-hover/role:opacity-100 hover:text-blue-600 text-gray-400 p-0.5 rounded transition-all cursor-pointer inline-flex items-center"
                                title="Edit role description"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => startDeleteEmployee(emp)}
                          className="p-1 px-2.5 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg flex items-center transition-all cursor-pointer flex-shrink-0"
                          title="Remove Employee"
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Remove
                        </button>
                      </div>

                      {/* Info badges row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md font-semibold">
                            ID: {emp.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => unfinished.length > 0 && toggleEmpExpanded(emp.id)}
                            disabled={unfinished.length === 0}
                            className={`text-xs px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 ${
                              unfinished.length > 0
                                ? "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 cursor-pointer"
                                : "bg-green-50 border border-green-200 text-green-700 cursor-default"
                            }`}
                          >
                            {unfinished.length} unfinished tasks
                            {unfinished.length > 0 && (
                              isExpanded ? <ChevronUp className="h-3.5 w-3.5 inline" /> : <ChevronDown className="h-3.5 w-3.5 inline" />
                            )}
                          </button>
                        </div>

                        {unfinished.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleEmpExpanded(emp.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold cursor-pointer flex items-center gap-0.5"
                          >
                            {isExpanded ? "Hide Tasks" : "View Tasks"}
                          </button>
                        )}
                      </div>

                      {/* Unfinished tasks list panel */}
                      {isExpanded && unfinished.length > 0 && (
                        <div className="mt-2 pt-3 border-t border-dashed border-gray-200 space-y-2 font-sans">
                          <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                            Unfinished Assignments ({unfinished.length})
                          </p>
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {unfinished.map((task) => {
                              return (
                                <div
                                  key={task.id}
                                  onClick={() => {
                                    if (onFocusTask) {
                                      const dateVal = task.start instanceof Date ? task.start : new Date(task.start);
                                      onFocusTask(emp.id, task.id, dateVal);
                                    }
                                  }}
                                  className="bg-white border border-gray-250 hover:border-blue-400 hover:shadow-xs rounded-lg p-2.5 text-xs font-semibold text-gray-700 flex flex-col gap-1.5 shadow-2xs cursor-pointer transition-all hover:scale-[1.01] group relative"
                                  title="Go to this task in the Engineering/Quality Schedule to mark complete or edit"
                                >
                                  {/* Task basic Header */}
                                  <div className="flex items-start justify-between gap-1.5">
                                    <div className="flex flex-col">
                                      <span className="font-extrabold text-gray-900 text-xs uppercase leading-none">
                                        {task.category}
                                      </span>
                                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide mt-0.5">
                                        {task.type}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      {task.blocked && (
                                        <span className="bg-red-50 text-red-700 border border-red-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 animate-pulse uppercase">
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          Blocked
                                        </span>
                                      )}
                                      <span
                                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border uppercase ${
                                          task.priority === "High"
                                            ? "bg-red-50 border-red-200 text-red-700 font-bold"
                                            : task.priority === "Medium"
                                              ? "bg-amber-50 border-amber-200 text-amber-700 font-bold"
                                              : "bg-gray-100 border-gray-250 text-gray-600 font-bold"
                                        }`}
                                      >
                                        {task.priority}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Dates & Hours */}
                                  <div className="flex items-center justify-between text-[11px] text-gray-650 font-mono gap-1 bg-gray-50 p-1.5 rounded-md border border-gray-100">
                                    <span className="flex items-center gap-1 font-semibold">
                                      <Calendar className="h-3.5 w-3.5 text-blue-500" />
                                      {formatTaskDate(task.start)} → {formatTaskDate(task.end)}
                                    </span>
                                    <span className="font-extrabold text-gray-900 bg-white border border-gray-200 px-1 py-0.5 rounded-sm">
                                      {task.totalHours} hrs
                                    </span>
                                  </div>

                                  {/* Notes/Details */}
                                  {task.details && (
                                    <p className="text-[10px] text-gray-500 italic leading-snug border-l-2 border-gray-300 pl-1.5 mt-0.5 font-medium">
                                      {task.details}
                                    </p>
                                  )}

                                  {/* Visual navigation nudge helper indicator */}
                                  <div className="mt-1 flex justify-end border-t border-gray-100 pt-1.5">
                                    <span className="text-[9px] text-blue-600 group-hover:text-blue-700 font-extrabold flex items-center gap-1 uppercase tracking-widest leading-none">
                                      <span>Locate in Schedule</span>
                                      <svg className="h-3 w-3 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                      </svg>
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Reassign Modal Overlay */}
      {showReassignModal && deletingEmployee && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center mb-4">
              <AlertTriangle className="text-amber-500 h-6 w-6 mr-2 flex-shrink-0" />
              Reassign Outstanding Tasks
            </h3>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              <strong>{deletingEmployee.name}</strong> is currently assigned to{" "}
              <strong>{deletingEmployee.tasks.filter((t) => !t.completed && !t.isDone).length}</strong> unfinished
              tasks. Before removing them, choose a team member below to take over these obligations:
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Reassign Unfinished Tasks To:
                </label>
                <select
                  value={reassignTargetId}
                  onChange={(e) => setReassignTargetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  {personnel
                    .filter((p) => p.dept === deletingEmployee.dept && p.id !== deletingEmployee.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end leading-none">
              <button
                type="button"
                onClick={() => {
                  setShowReassignModal(false);
                  setDeletingEmployee(null);
                }}
                className="px-4 py-2 bg-gray-150 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finishDeleteEmployee(deletingEmployee, Number(reassignTargetId))}
                className="px-4 py-2 bg-red-650 hover:bg-red-755 text-white rounded-lg text-sm font-bold transition-colors"
              >
                Proceed &amp; Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
