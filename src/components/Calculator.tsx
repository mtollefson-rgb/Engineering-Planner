/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Employee, TaskTypeConfig } from "../types";
import { Calculator as CalcIcon, UserCheck, Calendar, ArrowRight, ShieldAlert } from "lucide-react";

interface CalculatorProps {
  personnel: Employee[];
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
    }
  ) => Promise<void>;
  taskTypes: Record<string, TaskTypeConfig>;
}

export default function Calculator({ personnel, categoryCosts, onAddTask, taskTypes }: CalculatorProps) {
  const [selectedProd, setSelectedProd] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const [calcQty, setCalcQty] = useState(1);
  const [estimateHr, setEstimateHr] = useState(0.0);

  // Assignment Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number>(0);
  const [assignStart, setAssignStart] = useState("");
  const [assignEnd, setAssignEnd] = useState("");
  const [assignPriority, setAssignPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [assignNotes, setAssignNotes] = useState("");

  const products = Object.keys(categoryCosts).sort();
  
  // Filter quantity-based tracked tasks from custom configuration
  const allAvailableTasks = Object.keys(taskTypes || {})
    .filter((t) => taskTypes[t].trackingType === "number")
    .sort();

  // Set defaults
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

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    setAssignStart(todayStr);
    setAssignEnd(todayStr);

    if (personnel.length > 0) {
      setAssigneeId(personnel[0].id);
    }
  }, [personnel]);

  // Estimate computation
  useEffect(() => {
    if (selectedProd && selectedTask) {
      const baseCost = categoryCosts[selectedProd]?.[selectedTask] ?? 1.0;
      setEstimateHr(baseCost * calcQty);
    }
  }, [selectedProd, selectedTask, calcQty, categoryCosts]);

  const handleOpenAssign = () => {
    if (estimateHr <= 0) {
      alert("Please configure a valid task load first.");
      return;
    }
    setShowAssignModal(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStart || !assignEnd || assigneeId === 0) {
      alert("Please fill in assignment dates.");
      return;
    }

    const start = new Date(assignStart + "T00:00:00");
    const end = new Date(assignEnd + "T00:00:00");

    if (end < start) {
      alert("End date cannot be earlier than start date.");
      return;
    }

    await onAddTask(assigneeId, {
      category: selectedProd,
      type: selectedTask,
      qty: calcQty,
      start,
      end,
      priority: assignPriority,
      details: assignNotes.trim()
        ? `[Calculator Assigned] ${assignNotes.trim()}`
        : "[Calculator Assigned]",
    });

    // Reset notes and dismiss
    setAssignNotes("");
    setShowAssignModal(false);
    alert("Task has been successfully estimated and allocated to employee schedule!");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <div className="border-b border-gray-100 pb-3 mb-5 flex items-center gap-2">
          <CalcIcon className="text-blue-500 h-6 w-6" />
          <h3 className="text-lg font-bold text-gray-900 uppercase tracking-tight">
            Workload Estimator
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Select Product Category
            </label>
            <select
              value={selectedProd}
              onChange={(e) => setSelectedProd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none"
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
              Select Task Type
            </label>
            <select
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none font-semibold text-gray-750"
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

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Multiplier / Quantity
            </label>
            <input
              type="number"
              min="1"
              value={calcQty}
              onChange={(e) => setCalcQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none font-semibold"
            />
          </div>

          {/* Load output frame */}
          <div className="bg-blue-50 border border-blue-150 rounded-lg p-5 text-center my-6">
            <span className="text-xs uppercase tracking-wider text-blue-600 font-extrabold block mb-1">
              Estimated Delivery Window
            </span>
            <span className="text-4xl font-black text-blue-700 tracking-tight block">
              {estimateHr.toFixed(1)} <span className="text-lg font-bold">hrs</span>
            </span>
            <span className="text-[10px] text-blue-500 font-bold block mt-2">
              Based on base allocation standards
            </span>
          </div>

          <button
            onClick={handleOpenAssign}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <UserCheck className="h-4.5 w-4.5" />
            Convert to Task &amp; Assign
          </button>
        </div>
      </div>

      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleAssignSubmit}
            className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md w-full shadow-2xl relative"
          >
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center uppercase mb-4 text-blue-600">
              <UserCheck className="h-5 w-5 mr-1.5" />
              Assign Estimations
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Assign To
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-sm font-semibold select-none text-gray-700 focus:outline-none"
                >
                  {personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.dept === "eng" ? "ENG" : "QC"}] {p.name} — {p.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={assignStart}
                    onChange={(e) => setAssignStart(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={assignEnd}
                    onChange={(e) => setAssignEnd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Priority
                </label>
                <select
                  value={assignPriority}
                  onChange={(e) => setAssignPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-sm focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Task specific instructions..."
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 bg-gray-50 rounded-lg text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end leading-none">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm"
              >
                Apply Assignment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
