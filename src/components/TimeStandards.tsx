/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Employee, Subtask, TaskTypeConfig } from "../types";
import { doc, setDoc, db, handleFirestoreError, OperationType } from "../firebase";
import { Clock, Plus, Trash2, CheckCircle, Save, FolderPlus, FilePlus, Settings, Check } from "lucide-react";

interface TimeStandardsProps {
  personnel: Employee[];
  categoryCosts: Record<string, Record<string, number>>;
  taskBreakdowns: Record<string, Record<string, Subtask[]>>;
  onRefresh: () => void;
  taskTypes: Record<string, TaskTypeConfig>;
}

export default function TimeStandards({
  personnel,
  categoryCosts,
  taskBreakdowns,
  onRefresh,
  taskTypes,
}: TimeStandardsProps) {
  const [selectedProd, setSelectedProd] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [successMsg, setSuccessMsg] = useState("");

  // Category and Task management states
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySuccess, setCategorySuccess] = useState("");

  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDept, setNewTaskDept] = useState<"eng" | "qual" | "both">("eng");
  const [newTaskTrackingType, setNewTaskTrackingType] = useState<"hours" | "number">("number");
  const [taskSuccess, setTaskSuccess] = useState("");

  const products = Object.keys(categoryCosts).sort();
  
  // We edit standard hours of "number" tracking types (which depend on product categories)
  const allAvailableTasks = Object.keys(taskTypes || {})
    .filter((taskName) => taskTypes[taskName].trackingType === "number")
    .sort();

  // Set defaults when lists change or load
  useEffect(() => {
    if (products.length > 0 && !selectedProd) {
      setSelectedProd(products[0]);
    }
  }, [categoryCosts]);

  useEffect(() => {
    if (allAvailableTasks.length > 0 && !selectedTask) {
      setSelectedTask(allAvailableTasks[0]);
    }
  }, [taskTypes]);

  // Fetch or initialize breakdowns when selection changes
  useEffect(() => {
    if (selectedProd && selectedTask) {
      const breakdown = taskBreakdowns[selectedProd]?.[selectedTask];
      if (breakdown) {
        setSubtasks(JSON.parse(JSON.stringify(breakdown)));
      } else {
        // Fallback or initialize based on flat base standard hour
        const baseCost = categoryCosts[selectedProd]?.[selectedTask] ?? 1.0;
        setSubtasks([{ name: "General Allocation", hours: baseCost }]);
      }
    }
  }, [selectedProd, selectedTask, taskBreakdowns, categoryCosts]);

  const handleAddSubtask = () => {
    setSubtasks([...subtasks, { name: "", hours: 0.5 }]);
  };

  const handleUpdateSubtask = (idx: number, field: keyof Subtask, value: any) => {
    const updated = [...subtasks];
    if (field === "hours") {
      updated[idx].hours = Math.max(0, parseFloat(value) || 0);
    } else {
      updated[idx].name = value;
    }
    setSubtasks(updated);
  };

  const handleRemoveSubtask = (idx: number) => {
    const updated = [...subtasks];
    updated.splice(idx, 1);
    setSubtasks(updated);
  };

  const handleSaveStandards = async () => {
    if (!selectedProd || !selectedTask) return;

    try {
      const newTotalCost = subtasks.reduce((sum, s) => sum + s.hours, 0);

      // Deep copy existing configuration state to write to Firebase config/standards
      const updatedCosts = JSON.parse(JSON.stringify(categoryCosts));
      const updatedBreakdowns = JSON.parse(JSON.stringify(taskBreakdowns));

      if (!updatedCosts[selectedProd]) updatedCosts[selectedProd] = {};
      updatedCosts[selectedProd][selectedTask] = newTotalCost;

      if (!updatedBreakdowns[selectedProd]) updatedBreakdowns[selectedProd] = {};
      updatedBreakdowns[selectedProd][selectedTask] = subtasks;

      // Write parameters back to Standards
      const confRef = doc(db, "config", "standards");
      await setDoc(confRef, {
        costs: updatedCosts,
        breakdowns: updatedBreakdowns,
        taskTypes: taskTypes,
      });

      // Retroactively align all personnel tasks of this category + type
      for (const p of personnel) {
        let isModified = false;
        const pTasks = [...p.tasks];

        pTasks.forEach((t) => {
          if (t.category === selectedProd && t.type === selectedTask) {
            t.costPerUnit = newTotalCost;
            t.totalHours = newTotalCost * t.qty;

            const ts = new Date(t.start);
            const te = new Date(t.end);
            const duration = (te.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24) + 1;
            t.dailyRate = t.totalHours / Math.max(1, duration);
            isModified = true;
          }
        });

        if (isModified) {
          const pRef = doc(db, "personnel", String(p.id));
          await setDoc(pRef, { info: { id: p.id, name: p.name, role: p.role, dept: p.dept }, tasks: pTasks });
        }
      }

      setSuccessMsg(`Successfully updated standards & recalculated schedules with a base ${newTotalCost.toFixed(1)}h allowance!`);
      onRefresh();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/standards");
    }
  };

  // Delete Product Category Controller
  const handleDeleteCategory = async (prodToDelete: string) => {
    if (!prodToDelete) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the product category "${prodToDelete}"? This will disable time standards calculations for this product.`
    );
    if (!confirmDelete) return;

    try {
      const updatedCosts = JSON.parse(JSON.stringify(categoryCosts));
      const updatedBreakdowns = JSON.parse(JSON.stringify(taskBreakdowns));

      delete updatedCosts[prodToDelete];
      delete updatedBreakdowns[prodToDelete];

      const confRef = doc(db, "config", "standards");
      await setDoc(confRef, {
        costs: updatedCosts,
        breakdowns: updatedBreakdowns,
        taskTypes: taskTypes,
      });

      // Update current selected product if needed
      const remainingProducts = Object.keys(updatedCosts);
      if (selectedProd === prodToDelete) {
        setSelectedProd(remainingProducts[0] || "");
      }

      setCategorySuccess(`Product category "${prodToDelete}" successfully deleted.`);
      onRefresh();
      setTimeout(() => setCategorySuccess(""), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/standards");
    }
  };

  // Add Product Category Controller
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedName = newCategoryName.trim();
    if (!formattedName) return;

    if (categoryCosts[formattedName]) {
      alert(`Product category "${formattedName}" already exists.`);
      return;
    }

    try {
      const updatedCosts = JSON.parse(JSON.stringify(categoryCosts));
      updatedCosts[formattedName] = {};

      // Initialize defaults for the new product category across all current active quantity-based task types
      allAvailableTasks.forEach((taskName) => {
        updatedCosts[formattedName][taskName] = 1.0; 
      });

      const confRef = doc(db, "config", "standards");
      await setDoc(confRef, {
        costs: updatedCosts,
        breakdowns: taskBreakdowns,
        taskTypes: taskTypes,
      });

      setSelectedProd(formattedName);
      setNewCategoryName("");
      setCategorySuccess(`Product category "${formattedName}" successfully created!`);
      setTimeout(() => setCategorySuccess(""), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/standards");
    }
  };

  // Delete Task Type Config Controller
  const handleDeleteTaskType = async (taskToDelete: string) => {
    if (!taskToDelete) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the task type "${taskToDelete}"? This will remove standard coefficients and tracking configuration for this task type.`
    );
    if (!confirmDelete) return;

    try {
      // Remove from taskTypes map
      const updatedTaskTypes = JSON.parse(JSON.stringify(taskTypes || {}));
      delete updatedTaskTypes[taskToDelete];

      // Remove from categoryCosts and breakdowns for all categories
      const updatedCosts = JSON.parse(JSON.stringify(categoryCosts));
      const updatedBreakdowns = JSON.parse(JSON.stringify(taskBreakdowns));

      Object.keys(updatedCosts).forEach((prodName) => {
        if (updatedCosts[prodName]) {
          delete updatedCosts[prodName][taskToDelete];
        }
      });
      Object.keys(updatedBreakdowns).forEach((prodName) => {
        if (updatedBreakdowns[prodName]) {
          delete updatedBreakdowns[prodName][taskToDelete];
        }
      });

      const confRef = doc(db, "config", "standards");
      await setDoc(confRef, {
        costs: updatedCosts,
        breakdowns: updatedBreakdowns,
        taskTypes: updatedTaskTypes,
      });

      // Update current selected task if needed
      const remainingTasks = Object.keys(updatedTaskTypes).filter(
        (t) => updatedTaskTypes[t].trackingType === "number"
      );
      if (selectedTask === taskToDelete) {
        setSelectedTask(remainingTasks[0] || "");
      }

      setTaskSuccess(`Task type "${taskToDelete}" successfully deleted.`);
      onRefresh();
      setTimeout(() => setTaskSuccess(""), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/standards");
    }
  };

  // Add Task Type Config Controller
  const handleAddTaskType = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedName = newTaskName.trim();
    if (!formattedName) return;

    if (taskTypes[formattedName]) {
      alert(`Task type "${formattedName}" already exists.`);
      return;
    }

    try {
      // Deep Copy current taskTypes map and insert the configured specs
      const updatedTaskTypes = JSON.parse(JSON.stringify(taskTypes || {}));
      updatedTaskTypes[formattedName] = {
        dept: newTaskDept,
        trackingType: newTaskTrackingType,
      };

      // If it is numeric (quantity based), initialize standard category costs for this new task
      const updatedCosts = JSON.parse(JSON.stringify(categoryCosts));
      if (newTaskTrackingType === "number") {
        Object.keys(updatedCosts).forEach((prodName) => {
          updatedCosts[prodName][formattedName] = 1.0; // 1.0 hour baseline
        });
      }

      const confRef = doc(db, "config", "standards");
      await setDoc(confRef, {
        costs: updatedCosts,
        breakdowns: taskBreakdowns,
        taskTypes: updatedTaskTypes,
      });

      if (newTaskTrackingType === "number") {
        setSelectedTask(formattedName);
      }
      setNewTaskName("");
      setTaskSuccess(`Task type "${formattedName}" mapped under tracking mode "${newTaskTrackingType.toUpperCase()}"!`);
      setTimeout(() => setTaskSuccess(""), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/standards");
    }
  };

  const totalSum = subtasks.reduce((sum, s) => sum + s.hours, 0);

  // SVG Render support for stunning clean Pie Chart calculations
  const renderPieChart = () => {
    if (subtasks.length === 0 || totalSum === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-gray-400 bg-gray-50 border border-gray-150 rounded-lg min-h-60 italic text-sm">
          No subtask items defined.
        </div>
      );
    }

    const size = 200;
    const radius = 80;
    const center = size / 2;
    let accumulatedAngle = 0;

    const colors = [
      "#4285F4",
      "#34A853",
      "#FBBC05",
      "#EA4335",
      "#8E44AD",
      "#16A085",
      "#D35400",
      "#2C3E50",
      "#F39C12",
      "#27AE60",
    ];

    return (
      <div className="bg-white p-5 border border-gray-200 rounded-xl flex flex-col md:flex-row items-center gap-6 shadow-3xs w-full">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 mx-auto md:mx-0">
          <g transform={`rotate(-90 ${center} ${center})`}>
            {subtasks.map((s, idx) => {
              if (s.hours <= 0) return null;
              const percentage = s.hours / totalSum;
              const angle = percentage * 360;

              // Compute SVG Arc coordinates
              const x1 = center + radius * Math.cos((accumulatedAngle * Math.PI) / 180);
              const y1 = center + radius * Math.sin((accumulatedAngle * Math.PI) / 180);

              accumulatedAngle += angle;

              const x2 = center + radius * Math.cos((accumulatedAngle * Math.PI) / 180);
              const y2 = center + radius * Math.sin((accumulatedAngle * Math.PI) / 180);

              const largeArcFlag = angle > 180 ? 1 : 0;
              const color = colors[idx % colors.length];

              const pathDetails = `
                M ${center},${center}
                L ${x1},${y1}
                A ${radius},${radius} 0 ${largeArcFlag} 1 ${x2},${y2}
                Z
              `;

              return (
                <path
                  key={idx}
                  d={pathDetails}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="hover:opacity-85 transition-opacity"
                  title={`${s.name || "Unnamed"}: ${s.hours}h`}
                />
              );
            })}
          </g>
          {/* Centering ring for donut aesthetics */}
          <circle cx={center} cy={center} r={40} fill="#ffffff" />
        </svg>

        <div className="flex-1 space-y-2 max-h-56 overflow-y-auto w-full">
          <span className="text-xs uppercase tracking-wider text-gray-400 font-extrabold block">
            Subtask Allocation Legend
          </span>
          {subtasks.map((s, idx) => {
            const color = colors[idx % colors.length];
            const pct = totalSum > 0 ? ((s.hours / totalSum) * 100).toFixed(0) : "0";
            return (
              <div key={idx} className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-gray-700 capitalize max-w-44 truncate">
                    {s.name || "—"}
                  </span>
                </div>
                <span className="text-gray-500 font-bold">
                  {s.hours.toFixed(1)}h ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-xl flex items-center">
          <CheckCircle className="text-green-500 mr-3 h-5 w-5 animate-bounce" />
          <p className="text-sm font-semibold text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Editor Block */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center uppercase tracking-tight">
          <Clock className="text-blue-600 mr-2 h-5 w-5" />
          Product Time Standards Editor
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-100 pb-5 mb-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Product Category
            </label>
            <select
              value={selectedProd}
              onChange={(e) => setSelectedProd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-700"
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
              Task Type Standard (Quantity-based)
            </label>
            <select
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-750"
            >
              <optgroup label="Quantity Tracked Tasks">
                {allAvailableTasks.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* List parameters */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Subtasks Allocation Grid
            </h4>

            {subtasks.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 italic text-center">
                No active subtask groupings. Let's create one.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {subtasks.map((s, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="e.g. Set up apparatus"
                      value={s.name}
                      onChange={(e) => handleUpdateSubtask(idx, "name", e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-350 rounded-lg text-sm bg-gray-50 uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={s.hours}
                        onChange={(e) => handleUpdateSubtask(idx, "hours", e.target.value)}
                        className="w-20 px-2 py-1.5 border border-gray-350 text-center rounded-lg text-sm bg-gray-50 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                      />
                      <span className="text-xs text-gray-400 font-bold">h</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(idx)}
                      className="p-1 px-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent rounded-lg transition-colors cursor-pointer"
                      title="Remove subtask line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-3 border-t border-gray-100 items-center justify-between">
              <button
                type="button"
                onClick={handleAddSubtask}
                className="py-1.5 px-4 bg-white hover:bg-gray-50 border border-gray-250 text-gray-500 text-sm font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center"
              >
                <Plus className="mr-1 h-4 w-4 text-blue-500" />
                Add Subtask Line
              </button>

              <div className="text-right leading-none">
                <span className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">
                  Accumulated Standard Sum
                </span>
                <span className="text-xl font-black text-gray-950">
                  {totalSum.toFixed(1)} <span className="text-xs font-semibold text-gray-500">hrs</span>
                </span>
              </div>
            </div>

            <button
              onClick={handleSaveStandards}
              className="w-full mt-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Save className="h-4.5 w-4.5" />
              Update Standard &amp; Recalculate Schedules
            </button>
          </div>

          {/* Visualization plot */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Subtasks Allocation Visualization
            </h4>
            {renderPieChart()}
          </div>
        </div>
      </div>      {/* Dynamic Creation Grid Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ADD PRODUCT CATEGORY */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <FolderPlus className="text-teal-600 h-5 w-5" />
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Add New Product Category</h4>
            </div>
            
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Create a custom engineering product track. The custom product will be initialized with 1.0 hour baseline standards across all existing quantity-based task types.
            </p>

            {categorySuccess && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium flex items-center gap-1.5">
                <Check className="h-4 w-4 text-green-600" />
                {categorySuccess}
              </div>
            )}

            <form onSubmit={handleAddCategory} className="space-y-3">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                  Product Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electric Lift Supports"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <Plus className="h-4 w-4" />
                Create Product Option
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                Manage / Delete Existing Categories
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {products.map((p) => (
                  <div key={p} className="flex items-center justify-between text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg font-semibold text-gray-700">
                    <span className="truncate max-w-[200px]">{p}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(p)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-md transition-colors cursor-pointer"
                      title={`Delete ${p}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ADD TASK TYPE */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <FilePlus className="text-indigo-600 h-5 w-5" />
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Add Custom Task Type</h4>
            </div>

            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Register a dynamic task. You can classify it as **By Hours** (direct duration entry e.g. Meetings, Training) or **By Quantity Number** (product coefficient e.g. Attribute Fill-Ins).
            </p>

            {taskSuccess && (
              <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium flex items-center gap-1.5">
                <Check className="h-4 w-4 text-green-600" />
                {taskSuccess}
              </div>
            )}

            <form onSubmit={handleAddTaskType} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                    Department Access
                  </label>
                  <select
                    value={newTaskDept}
                    onChange={(e) => setNewTaskDept(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="eng">Engineering Only</option>
                    <option value="qual">Quality Only</option>
                    <option value="both">Both Departments</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                    Tracking Matrix Type
                  </label>
                  <select
                    value={newTaskTrackingType}
                    onChange={(e) => setNewTaskTrackingType(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-blue-600"
                  >
                    <option value="number">By Number (Quantity-based)</option>
                    <option value="hours">By Hours (Meeting/Block duration)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">
                  Task Type Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Field Investigation"
                  required
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <Plus className="h-4 w-4" />
                Define Task Type
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-2">
                Manage / Delete Existing Task Types
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {Object.keys(taskTypes || {}).sort().map((t) => {
                  const conf = taskTypes[t];
                  const trackingLabel = conf.trackingType === "number" ? "QTY" : "HRS";
                  const deptLabel = conf.dept === "both" ? "ALL" : conf.dept.toUpperCase();
                  return (
                    <div key={t} className="flex items-center justify-between text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg font-semibold text-gray-700">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate max-w-[130px]" title={t}>{t}</span>
                        <div className="flex gap-1 flex-shrink-0">
                          <span className="px-1 text-[8px] font-extrabold bg-blue-50 text-blue-600 border border-blue-250 rounded">
                            {trackingLabel}
                          </span>
                          <span className="px-1 text-[8px] font-extrabold bg-indigo-50 text-indigo-600 border border-indigo-250 rounded">
                            {deptLabel}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteTaskType(t)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-md transition-colors cursor-pointer"
                        title={`Delete ${t}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
