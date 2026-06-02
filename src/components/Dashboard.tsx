/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Employee, Task, TaskTypeConfig } from "../types";
import {
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  ShieldCheck,
  Ban,
  Trash2,
  Edit,
  History,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

interface DashboardProps {
  personnel: Employee[];
  activeDept: "eng" | "qual";
  currentWeekStart: Date;
  onChangeWeek: (dir: number) => void;
  categoryCosts: Record<string, Record<string, number>>;
  onAddTask: (
    pId: number,
    taskData: {
      category: string;
      type: string;
      qty: number;
      start: Date;
      end: Date;
      priority: "Low" | "Medium" | "High";
      details: string;
      manualHours?: number;
    }
  ) => Promise<void>;
  onUpdateTaskStatus: (pId: number, tId: number, action: string) => Promise<void>;
  onEditTask: (
    pId: number,
    tId: number,
    start: Date,
    end: Date,
    details: string
  ) => Promise<void>;
  onBlockTask: (pId: number, tId: number, reason: string) => Promise<void>;
  taskTypes: Record<string, TaskTypeConfig>;
  focusedTaskInfo?: { pId: number; tId: number; date: Date } | null;
  onClearFocusTask?: () => void;
}

export default function Dashboard({
  personnel,
  activeDept,
  currentWeekStart,
  onChangeWeek,
  categoryCosts,
  onAddTask,
  onUpdateTaskStatus,
  onEditTask,
  onBlockTask,
  taskTypes,
  focusedTaskInfo,
  onClearFocusTask,
}: DashboardProps) {
  // Input fields state
  const [selectedEmpId, setSelectedEmpId] = useState<number>(0);
  const [product, setProduct] = useState("");
  const [taskType, setTaskType] = useState("");
  const [manualHours, setManualHours] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [notes, setNotes] = useState("");

  // Modals state
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [blockingTask, setBlockingTask] = useState<{ pId: number; tId: number } | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [editingTask, setEditingTask] = useState<{
    pId: number;
    tId: number;
    start: string;
    end: string;
    details: string;
  } | null>(null);

  const activeStaff = personnel.filter((p) => p.dept === activeDept);
  const products = Object.keys(categoryCosts).sort();

  // Dynamically group tracking methods based on backend config standards
  const deptTrackedTasks = Object.keys(taskTypes || {}).filter((t) => {
    const conf = taskTypes[t];
    return (conf.dept === activeDept || conf.dept === "both") && conf.trackingType === "number";
  }).sort();

  const deptManualTasks = Object.keys(taskTypes || {}).filter((t) => {
    const conf = taskTypes[t];
    return (conf.dept === activeDept || conf.dept === "both") && conf.trackingType === "hours";
  }).sort();

  // Reset employee selection when department changes or task types load
  useEffect(() => {
    if (activeStaff.length > 0) {
      setSelectedEmpId(activeStaff[0].id);
    }
    const firstType = deptTrackedTasks[0] || deptManualTasks[0] || "";
    setTaskType(firstType);
  }, [activeDept, personnel, taskTypes]);

  useEffect(() => {
    if (products.length > 0 && !product) {
      setProduct(products[0]);
    }
  }, [categoryCosts]);

  // Set default dates
  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    setStartDate(todayStr);
    setEndDate(todayStr);
  }, []);

  // Scroll focused task into interactive view
  useEffect(() => {
    if (focusedTaskInfo) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`task-card-${focusedTaskInfo.tId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [focusedTaskInfo]);

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const addDays = (d: Date, n: number) => {
    const date = new Date(d);
    date.setDate(date.getDate() + n);
    return date;
  };

  // Capacity calculations for progress display
  const getWeeklyLoad = (person: Employee, weekStart: Date) => {
    const weekEnd = addDays(weekStart, 6);
    weekEnd.setHours(23, 59, 59, 999);
    let projectHours = 0;

    const tasks = person.tasks.filter((t) => {
      const ts = new Date(t.start);
      const te = new Date(t.end);
      return te >= weekStart && ts <= weekEnd && !t.blocked;
    });

    tasks.forEach((t) => {
      const ts = new Date(t.start);
      const te = new Date(t.end);
      const os = new Date(Math.max(ts.getTime(), weekStart.getTime()));
      const oe = new Date(Math.min(te.getTime(), weekEnd.getTime()));
      const days = (oe.getTime() - os.getTime()) / (1000 * 60 * 60 * 24) + 1;
      if (days > 0 && t.dailyRate) {
        projectHours += t.dailyRate * days;
      }
    });

    // Check if employee has baseline hours (Techs generally don't, others do)
    const hasBaselineHours = !person.role.toLowerCase().includes("tech");
    const standardBaseline = hasBaselineHours ? 27 : 0;
    const baseline = Math.max(0, Math.min(standardBaseline, 45 - projectHours));
    const total = baseline + projectHours;

    return { baseline, project: projectHours, total, hasBaselineHours };
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !taskType || !startDate || !endDate) {
      alert("Please fill in all core fields");
      return;
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");

    if (end < start) {
      alert("End date cannot be earlier than start date.");
      return;
    }

    // Determine cost
    let cost = categoryCosts[product]?.[taskType];
    if (cost === undefined) cost = 1.0;

    const isManual = taskTypes[taskType]?.trackingType === "hours";
    if (isManual) {
      const hours = parseFloat(manualHours);
      if (isNaN(hours) || hours <= 0) {
        alert("Please enter a valid amount of total hours for this manual task.");
        return;
      }
      cost = hours / qty;
    }

    // Workload check & VP Approval trigger
    const person = personnel.find((x) => x.id === selectedEmpId);
    if (!person) return;

    const targetWeek = getMonday(start);
    const stats = getWeeklyLoad(person, targetWeek);

    const totalHours = cost * qty;
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const dailyRate = totalHours / Math.max(1, duration);

    const overlapDays = Math.min(5, duration); // business week impact
    const newProjectImpact = dailyRate * overlapDays;
    const projectedProjectTotal = stats.project + newProjectImpact;

    let triggerVP = false;
    let warningMsg = "";

    const hasBaseline = !person.role.toLowerCase().includes("tech");
    if (!hasBaseline) {
      if (projectedProjectTotal > 45) {
        triggerVP = true;
        warningMsg = `${person.name} is a Tech. Adding this task elevates weekly project workload to ${projectedProjectTotal.toFixed(1)}h (Limit: 45h).`;
      }
    } else {
      if (projectedProjectTotal > 18) {
        triggerVP = true;
        warningMsg = `${person.name} is a baseline employee. Adding this task drops their Baseline reservation below 60% (27h). New Project Load is ${projectedProjectTotal.toFixed(1)}h.`;
      }
    }

    if (triggerVP) {
      const confirmVP = window.confirm(
        `⚠️ VP Approval Required\n\n${warningMsg}\n\nDo you have VP authorization to proceed with this task assignment?`
      );
      if (!confirmVP) return;
    }

    await onAddTask(selectedEmpId, {
      category: product,
      type: taskType,
      qty,
      start,
      end,
      priority,
      details: notes,
      manualHours: isManual ? parseFloat(manualHours) : undefined,
    });

    // Reset inputs
    setManualHours("");
    setQty(1);
    setNotes("");
    const todayStr = new Date().toISOString().split("T")[0];
    setStartDate(todayStr);
    setEndDate(todayStr);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    const start = new Date(editingTask.start + "T00:00:00");
    const end = new Date(editingTask.end + "T00:00:00");

    if (end < start) {
      alert("End date cannot be earlier than start date");
      return;
    }

    await onEditTask(editingTask.pId, editingTask.tId, start, end, editingTask.details);
    setEditingTask(null);
  };

  const handleBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockingTask) return;
    await onBlockTask(blockingTask.pId, blockingTask.tId, blockReason);
    setBlockingTask(null);
    setBlockReason("");
  };

  const weekEndDisplay = addDays(currentWeekStart, 4);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      {/* Weekly Navigator */}
      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-xl border border-gray-150 shadow-xs">
        <button
          onClick={() => onChangeWeek(-1)}
          className="p-1.5 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <span className="text-sm font-bold text-blue-600 uppercase tracking-wider flex items-center">
          <Calendar className="mr-2 h-5 w-5 text-blue-500" />
          {currentWeekStart.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          —{" "}
          {weekEndDisplay.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <button
          onClick={() => onChangeWeek(1)}
          className="p-1.5 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {focusedTaskInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center text-xs font-bold text-amber-800 shadow-3xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>Target assignment located! The active card is highlighted with a gold boundary below.</span>
          </div>
          {onClearFocusTask && (
            <button
              onClick={onClearFocusTask}
              className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-200 text-amber-900 rounded-md transition-all cursor-pointer text-[10px] font-black uppercase tracking-wider shadow-3xs hover:scale-[1.02]"
            >
              Clear Focus Flag
            </button>
          )}
        </div>
      )}

      {/* Task Creation Form Panel */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <h3 className="text-md font-bold text-gray-900 tracking-tight flex items-center mb-4 uppercase">
          <Layers className="mr-2 h-5 w-5 text-blue-600" />
          Add Task / Time Off Block
        </h3>
        <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Personnel
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-700"
            >
              {activeStaff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Product Category
            </label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Task Type
            </label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              {deptTrackedTasks.length > 0 && (
                <optgroup label="Standard Tracked Tasks (By Multiplier)">
                  {deptTrackedTasks.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </optgroup>
              )}
              {deptManualTasks.length > 0 && (
                <optgroup label="Manual / Non-Product Blocks (By Hours)">
                  {deptManualTasks.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {taskTypes[taskType]?.trackingType === "hours" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Total Manual Hrs
              </label>
              <input
                type="number"
                step="0.5"
                placeholder="Total hours block"
                value={manualHours}
                onChange={(e) => setManualHours(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-700"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Quantity / Multiplier
            </label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-700"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Comments / Notes
            </label>
            <input
              type="text"
              placeholder="Provide context or constraints..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              className={`w-full py-2.5 rounded-lg text-sm font-bold text-white transition-colors cursor-pointer flex items-center justify-center ${
                activeDept === "eng"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Task Block
            </button>
          </div>
        </form>
      </div>

      {/* Main Staff Dashboard Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeStaff.length === 0 ? (
          <div className="col-span-2 bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-400 font-semibold text-sm">
            No employees registered in this department yet. Go to the "Team Management" tab to add staff.
          </div>
        ) : (
          activeStaff.map((p) => {
            const stats = getWeeklyLoad(p, currentWeekStart);
            const projPct = Math.min(100, (stats.project / 45) * 100);
            const actualPct = Math.round((stats.project / 45) * 100);
            const basePct = Math.min(100 - projPct, (stats.baseline / 45) * 100);

            const isVPRequired = stats.hasBaselineHours ? stats.project > 18 : stats.project > 45;

            // Get weekly tasks
            const weekEnd = addDays(currentWeekStart, 6);
            weekEnd.setHours(23, 59, 59, 999);
            const weeklyTasks = p.tasks.filter((t) => {
              const ts = new Date(t.start);
              const te = new Date(t.end);
              return te >= currentWeekStart && ts <= weekEnd;
            });

            return (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-gray-200 shadow-xs flex flex-col overflow-hidden"
              >
                {/* Header card info */}
                <div className="bg-gray-50 border-b border-gray-150 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-gray-900 tracking-tight text-sm uppercase">
                      {p.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-semibold tracking-wide">
                      {p.role}
                    </p>
                  </div>
                  <span className="text-xs bg-white py-1 px-2.5 rounded-lg border border-gray-200 font-extrabold text-blue-600 shadow-3xs flex items-center">
                    <Clock className="mr-1 h-3.5 w-3.5" />
                    {stats.project.toFixed(1)}h Project / {stats.total.toFixed(1)}h Total
                  </span>
                </div>

                {/* Utilization Progress indicators */}
                <div className="p-4 border-b border-gray-100 space-y-2">
                  <div className="flex justify-between items-center text-xs text-gray-500 font-bold">
                    <span>Utilization Capacity Log</span>
                    <span
                      className={`font-extrabold ${isVPRequired ? "text-red-600" : "text-gray-700"}`}
                    >
                      {actualPct}% Assigned
                    </span>
                  </div>

                  <div
                    className={`h-7 w-full bg-gray-200 rounded-lg overflow-hidden flex shadow-inner relative border border-gray-250 ${
                      isVPRequired ? "bg-red-50 border-red-200" : ""
                    }`}
                  >
                    {/* Baseline segment */}
                    <div
                      style={{ width: `${basePct}%` }}
                      className="bg-gray-400 h-full flex items-center justify-center text-[10px] text-white font-extrabold shadow-sm transition-all duration-300"
                    >
                      {stats.baseline > 2 ? `${stats.baseline.toFixed(1)}h` : ""}
                    </div>

                    {/* Project work segment */}
                    <div
                      style={{ width: `${projPct}%` }}
                      className={`h-full flex items-center justify-center text-[10px] text-white font-extrabold transition-all duration-300 border-l border-white/20 shadow-sm ${
                        activeDept === "eng" ? "bg-blue-600" : "bg-purple-600"
                      }`}
                    >
                      {stats.project > 2 ? `${stats.project.toFixed(1)}h` : ""}
                    </div>

                    {/* VP warning overlays inside bar if over quota */}
                    {isVPRequired && (
                      <div className="absolute inset-0 bg-repeating-linear bg-red-600/10 pointer-events-none stripes" />
                    )}
                  </div>

                  {/* Warning line */}
                  {isVPRequired && (
                    <div className="flex items-center text-red-600 text-xs font-bold mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                      VP Approval Required
                    </div>
                  )}
                </div>

                {/* Tasks listings in week view */}
                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[380px]">
                  {weeklyTasks.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-xs font-semibold">
                      No assignments loaded for this period
                    </div>
                  ) : (
                    weeklyTasks.map((t) => {
                      const isComp = t.completed || t.isDone;
                      const taskEnd = new Date(t.end);
                      taskEnd.setHours(23, 59, 59, 999);
                      const isLate = !isComp && taskEnd.getTime() < today.getTime();
                      const isPTO = t.type === "PTO" || t.type === "Holiday";
                      const isFocused = focusedTaskInfo && String(t.id) === String(focusedTaskInfo.tId);

                      return (
                        <div
                          key={t.id}
                          id={`task-card-${t.id}`}
                          className={`border rounded-lg p-3 text-sm relative transition-all duration-300 ${
                            isFocused
                              ? "ring-4 ring-amber-500 bg-amber-50/50 border-amber-500 shadow-md scale-[1.01] z-5"
                              : isComp
                                ? "bg-green-50 border-green-200 opacity-75"
                                : t.blocked
                                  ? "bg-red-50 border-red-200 border-dashed"
                                  : isLate
                                    ? "bg-red-50 border-red-300"
                                    : "bg-white border-gray-220 hover:border-gray-300"
                          }`}
                        >
                          {/* Header of single task */}
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-gray-900 text-xs tracking-tight uppercase">
                              {isPTO ? `📅 ${t.type}` : `${t.category} - ${t.type}`}
                            </span>
                            <div className="flex items-center gap-1.5 leading-none">
                              {isFocused && (
                                <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-extrabold uppercase animate-pulse">
                                  📌 Target
                                </span>
                              )}
                              {t.blocked && (
                                <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-sm font-extrabold uppercase">
                                  Blocked
                                </span>
                              )}
                              {isLate && (
                                <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-sm font-extrabold uppercase">
                                  Late
                                </span>
                              )}
                              {isComp && (
                                <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded-sm font-extrabold uppercase">
                                  Completed
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Metadata logs */}
                          <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-gray-500 font-semibold items-center">
                            {!isPTO ? (
                              <span className="bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 text-gray-600">
                                {t.qty} Units
                              </span>
                            ) : (
                              <span className="bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 text-gray-600">
                                Leave
                              </span>
                            )}
                            <span className="bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 text-gray-650 font-bold">
                              {t.totalHours ? t.totalHours.toFixed(1) : ""} hrs
                            </span>
                            <span className="text-[11px] font-semibold text-gray-400">
                              Due:{" "}
                              {new Date(t.end).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>

                          {t.details && (
                            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-md p-2 text-xs text-gray-600 italic font-medium leading-relaxed">
                              {t.details}
                            </div>
                          )}

                          {/* Task Action items */}
                          <div className="mt-3 border-t border-gray-100 pt-2 flex items-center justify-between">
                            <button
                              onClick={() => setHistoryTask(t)}
                              className="text-gray-400 hover:text-blue-600 p-1 rounded-sm hover:bg-gray-50 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                              title="Audit Logging History"
                            >
                              <History className="h-3.5 w-3.5" />
                              Audit
                            </button>

                            <div className="flex gap-1">
                              {t.blocked ? (
                                <button
                                  onClick={() => onUpdateTaskStatus(p.id, t.id, "unblock")}
                                  className="text-green-600 p-1 rounded-md border border-green-200 hover:bg-green-50 text-xs font-extrabold transition-all px-2.5 cursor-pointer leading-none"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setBlockingTask({ pId: p.id, tId: t.id });
                                    setBlockReason("");
                                  }}
                                  className="text-gray-400 hover:text-red-600 p-1 hover:bg-gray-50 rounded-sm transition-colors cursor-pointer"
                                  title="Flag Blocked Status"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() =>
                                  setEditingTask({
                                    pId: p.id,
                                    tId: t.id,
                                    start: new Date(t.start).toISOString().split("T")[0],
                                    end: new Date(t.end).toISOString().split("T")[0],
                                    details: t.details || "",
                                  })
                                }
                                className="text-gray-400 hover:text-blue-600 p-1 hover:bg-gray-50 rounded-sm transition-colors cursor-pointer"
                                title="Edit task settings"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>

                              {!isComp && (
                                <button
                                  onClick={() => onUpdateTaskStatus(p.id, t.id, "complete")}
                                  className="text-gray-450 hover:text-green-600 p-1 hover:bg-gray-50 rounded-sm transition-colors cursor-pointer"
                                  title="Approve Completed Status"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  if (window.confirm("Delete this task from active logs?")) {
                                    onUpdateTaskStatus(p.id, t.id, "delete");
                                  }
                                }}
                                className="text-gray-400 hover:text-red-500 p-1 hover:bg-gray-50 rounded-sm transition-colors cursor-pointer"
                                title="Purge Record"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* History Log overlay modal */}
      {historyTask && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center uppercase mb-4 text-blue-600">
              <History className="h-5 w-5 mr-1.5" />
              Audit Logs History
            </h3>
            <div className="max-h-72 overflow-y-auto space-y-4">
              {historyTask.history?.map((h, i) => {
                const date = h.date && h.date.toDate ? h.date.toDate() : new Date(h.date);
                return (
                  <div key={i} className="border-l-2 border-gray-200 pl-3 py-1 text-xs">
                    <p className="text-gray-400/80 font-bold mb-0.5">
                      {date.toLocaleString()}
                    </p>
                    <p className="text-gray-700 font-semibold leading-relaxed">
                      {h.action}
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setHistoryTask(null)}
              className="mt-6 w-full py-2 bg-gray-100 text-gray-700 font-bold text-xs ring-1 ring-gray-200 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            >
              Close Panel
            </button>
          </div>
        </div>
      )}

      {/* Block reason capture modal overlay */}
      {blockingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleBlockSubmit}
            className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md w-full shadow-2xl relative"
          >
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center uppercase mb-4 text-red-600">
              <Ban className="h-5 w-5 mr-1.5" />
              Block Task Log
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Reason for block status
                </label>
                <textarea
                  required
                  placeholder="e.g. Waiting on customer specs or lab chamber maintenance..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 text-sm bg-gray-50 rounded-lg min-h-[90px] focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end leading-none">
              <button
                type="button"
                onClick={() => setBlockingTask(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm"
              >
                Apply block
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit dates details overlay modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleEditSubmit}
            className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md w-full shadow-2xl relative"
          >
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-1 flex items-center uppercase mb-4 text-blue-600">
              <Edit className="h-5 w-5 mr-1.5 animate-pulse" />
              Edit Properties
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={editingTask.start}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, start: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  required
                  value={editingTask.end}
                  onChange={(e) => setEditingTask({ ...editingTask, end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Comments / Notes
                </label>
                <textarea
                  placeholder="Task progress notes, updates..."
                  value={editingTask.details}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, details: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 text-sm bg-gray-50 rounded-lg min-h-[80px]"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end leading-none">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm"
              >
                Save Updates
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
