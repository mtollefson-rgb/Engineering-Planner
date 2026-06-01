/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { doc, setDoc, deleteDoc, updateDoc, arrayUnion, db, handleFirestoreError, OperationType } from "../firebase";
import { Employee, Task } from "../types";
import { UserPlus, UserMinus, AlertTriangle, CheckCircle, ShieldAlert } from "lucide-react";

interface TeamManagementProps {
  personnel: Employee[];
  onRefresh: () => void;
}

export default function TeamManagement({ personnel, onRefresh }: TeamManagementProps) {
  const [activeDept, setActiveDept] = useState<"eng" | "qual">("eng");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States for reassignment flow
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>("");
  const [showReassignModal, setShowReassignModal] = useState(false);

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

        // Prepare reassigned tasks
        const reassignedTasks: Task[] = unfinished.map((t) => ({
          ...t,
          history: [
            ...(t.history || []),
            {
              date: new Date(),
              action: `Reassigned from ${emp.name}`,
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

  const deptMembers = personnel.filter((p) => p.dept === activeDept);

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
      </div>

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
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Current {activeDept === "eng" ? "Engineering" : "Quality"} Staff
            </h3>
            {deptMembers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                No active employee directory listings. Use the left panel to register staff.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deptMembers.map((emp) => {
                  const unfinished = emp.tasks.filter((t) => !t.completed && !t.isDone);
                  return (
                    <div
                      key={emp.id}
                      className="border border-gray-250 hover:border-gray-300 rounded-xl p-4 bg-gray-50 flex justify-between items-start transition-all"
                    >
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm uppercase">{emp.name}</h4>
                        <p className="text-xs text-gray-500 font-medium">{emp.role}</p>
                        <div className="mt-3 flex gap-2">
                          <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md font-semibold">
                            ID: {emp.id}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md font-bold ${
                              unfinished.length > 0
                                ? "bg-amber-50 border border-amber-200 text-amber-700"
                                : "bg-green-50 border border-green-200 text-green-700"
                            }`}
                          >
                            {unfinished.length} unfinished tasks
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => startDeleteEmployee(emp)}
                        className="p-1 px-2.5 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg flex items-center transition-all cursor-pointer"
                        title="Remove Employee"
                      >
                        <UserMinus className="h-4 w-4 mr-1" />
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
