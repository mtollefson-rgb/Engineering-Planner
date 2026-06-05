/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Employee, Task } from "../types";
import { Calendar, Award, TrendingDown, Clock, ShieldAlert, BarChart, X, Activity, AlertCircle, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ExecutiveDashboardProps {
  personnel: Employee[];
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function ExecutiveDashboard({ personnel }: ExecutiveDashboardProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<"All" | number>("All");
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<{
    task: Task;
    empName: string;
  } | null>(null);

  const years = [2025, 2026, 2027];

  // Helper to extract timestamp date
  const parseTaskDate = (d: any): Date | null => {
    if (!d) return null;
    if (d.toDate) return d.toDate();
    return new Date(d);
  };

  const formatLocalDate = (d: any) => {
    const parsed = parseTaskDate(d);
    if (!parsed) return "N/A";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // 1. Compute Reliability Scores
  const reliabilityMetrics = personnel.map((p) => {
    const completedTasks = p.tasks.filter((t) => t.completed || t.isDone);
    const onTimeTasks = completedTasks.filter((t) => t.status === "On Time");
    const score = completedTasks.length ? Math.round((onTimeTasks.length / completedTasks.length) * 100) : 100;

    return {
      name: p.name,
      role: p.role,
      dept: p.dept,
      completed: completedTasks.length,
      onTime: onTimeTasks.length,
      score,
    };
  });

  // 2. Compute Top Time Consumers
  const allTasksMatched: {
    empName: string;
    task: Task;
  }[] = [];

  personnel.forEach((p) => {
    p.tasks.forEach((t) => {
      const startD = parseTaskDate(t.start);
      if (startD && startD.getFullYear() === selectedYear) {
        if (selectedMonth === "All" || startD.getMonth() === selectedMonth) {
          allTasksMatched.push({
            empName: p.name,
            task: t,
          });
        }
      }
    });
  });

  const topTimeConsumers = [...allTasksMatched]
    .sort((a, b) => (Number(b.task.totalHours) || 0) - (Number(a.task.totalHours) || 0))
    .slice(0, 8);

  // 3. Compute Monthly Stats Table Matrices (Total Hours vs Efficiency Loss)
  const computeMonthlyAggregate = (monIdx: number, pId: number) => {
    const p = personnel.find((x) => x.id === pId);
    if (!p) return 0;

    return p.tasks.reduce((acc, t) => {
      const startD = parseTaskDate(t.start);
      if (startD && startD.getFullYear() === selectedYear && startD.getMonth() === monIdx) {
        return acc + (Number(t.totalHours) || 0);
      }
      return acc;
    }, 0);
  };

  // Task type grouping helper for dynamic donut charts
  const getTaskDistributionForEmployee = (p: Employee) => {
    const distribution: Record<string, number> = {};
    p.tasks.forEach((t) => {
      const startD = parseTaskDate(t.start);
      if (startD && startD.getFullYear() === selectedYear) {
        if (selectedMonth === "All" || startD.getMonth() === selectedMonth) {
          distribution[t.type] = (distribution[t.type] || 0) + (Number(t.totalHours) || 0);
        }
      }
    });
    return distribution;
  };

  // Render donut plot per staff member
  const renderEmployeeDonut = (p: Employee) => {
    const distData = getTaskDistributionForEmployee(p);
    const entries = Object.entries(distData).sort((a, b) => b[1] - a[1]);
    const totalHrs = entries.reduce((acc, e) => acc + e[1], 0);

    if (totalHrs === 0) {
      return (
        <div className="bg-gray-50 border border-gray-150 rounded-lg p-5 flex flex-col justify-center items-center min-h-[160px]">
          <span className="text-xs uppercase font-extrabold text-gray-900 mb-1">{p.name}</span>
          <p className="text-[10px] text-gray-400 font-bold uppercase select-none">No hours allocated</p>
        </div>
      );
    }

    const size = 120;
    const radius = 45;
    const center = size / 2;
    let accumulatedAngle = 0;

    const colors = ["#2563eb", "#7c3aed", "#f59e0b", "#ec4899", "#10b981", "#6b7280"];

    return (
      <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col items-center justify-between">
        <span className="text-xs uppercase font-extrabold text-gray-900 tracking-tight block text-center mb-2">
          {p.name}
        </span>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mb-2">
          <g transform={`rotate(-90 ${center} ${center})`}>
            {entries.map((item, idx) => {
              const val = item[1];
              const percentage = val / totalHrs;
              const angle = percentage * 360;

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
                  className="hover:opacity-85 cursor-pointer"
                />
              );
            })}
          </g>
          {/* Inner cutout */}
          <circle cx={center} cy={center} r={24} fill="#ffffff" />
        </svg>

        {/* Legend */}
        <div className="w-full space-y-1 mt-2 border-t border-gray-100 pt-2 h-20 overflow-y-auto">
          {entries.slice(0, 3).map((item, idx) => {
            const color = colors[idx % colors.length];
            const pct = ((item[1] / totalHrs) * 100).toFixed(0);
            return (
              <div key={idx} className="flex items-center justify-between text-[10px] text-gray-500 font-semibold leading-none">
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate max-w-[70px] uppercase text-[9px]">{item[0]}</span>
                </div>
                <span>{pct}%</span>
              </div>
            );
          })}
          {entries.length > 3 && (
            <div className="text-[8px] text-gray-400 font-bold text-center uppercase pt-0.5">
              + {entries.length - 3} other items
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filtering suite */}
      <div className="bg-white px-6 py-4 rounded-xl border border-gray-150 shadow-xs flex flex-wrap gap-4 items-center justify-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">
            Report Year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-750 font-bold focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">
            Report Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) =>
              setSelectedMonth(e.target.value === "All" ? "All" : Number(e.target.value))
            }
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-750 font-bold focus:outline-none"
          >
            <option value="All">Full Year Spectrum</option>
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reliability stats */}
        <div className="bg-white p-5 border border-gray-200 rounded-xl shadow-xs lg:col-span-2 flex flex-col justify-between">
          <div className="border-b border-gray-100 pb-3 mb-4 flex items-center">
            <Award className="text-blue-500 mr-2 h-5.5 w-5.5" />
            <h3 className="font-extrabold text-sm uppercase text-gray-900 tracking-tight leading-none">
              On-Time Reliability Scorecard
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-150 text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase font-extrabold">
                <tr>
                  <th className="px-4 py-2 text-left">Staff Name</th>
                  <th className="px-4 py-2 text-center">On Time</th>
                  <th className="px-4 py-2 text-center">Late</th>
                  <th className="px-4 py-2 text-center">Total Completed</th>
                  <th className="px-4 py-2 text-center">Score</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 font-semibold text-gray-700">
                {reliabilityMetrics.map((emp) => {
                  let badge = "bg-green-50 text-green-700 border-green-200";
                  if (emp.score < 80) badge = "bg-red-50 text-red-700 border-red-200";
                  else if (emp.score < 90) badge = "bg-amber-50 text-amber-700 border-amber-200";

                  return (
                    <tr key={emp.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-bold uppercase text-gray-900">
                        {emp.name} <span className="text-[9px] text-gray-400">({emp.dept.toUpperCase()})</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-green-600 font-bold">{emp.onTime}</td>
                      <td className="px-4 py-2.5 text-center text-red-500 font-bold">
                        {emp.completed - emp.onTime}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-500 font-bold">{emp.completed}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-md border text-xs font-bold ${badge}`}>
                          {emp.score}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Time Consumers */}
        <div className="bg-white p-5 border border-gray-200 rounded-xl shadow-xs flex flex-col">
          <div className="border-b border-gray-100 pb-3 mb-4 flex items-center">
            <Clock className="text-amber-500 mr-2 h-5.5 w-5.5" />
            <h3 className="font-extrabold text-sm uppercase text-gray-900 tracking-tight leading-none">
              Top Time Consumers
            </h3>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[300px] pr-1">
            {topTimeConsumers.length === 0 ? (
              <p className="text-gray-400 italic text-center py-8 text-xs font-medium">
                No hours logged matching filters.
              </p>
            ) : (
              topTimeConsumers.map((item, idx) => {
                const t = item.task;
                const isBlocked = t.blocked;
                const isCompleted = t.completed || t.isDone;

                let borderClass = "border-gray-150 hover:border-blue-300 hover:bg-blue-50/20";
                let badgeClass = "bg-blue-50 text-blue-700 border-blue-200";

                if (isBlocked) {
                  borderClass = "border-red-150 hover:border-red-300 hover:bg-red-50/20";
                  badgeClass = "bg-red-50 text-red-700 border-red-200";
                } else if (isCompleted) {
                  borderClass = "border-green-150 hover:border-green-300 hover:bg-green-50/20";
                  badgeClass = "bg-green-50 text-green-700 border-green-200";
                }

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedTaskForModal({ task: t, empName: item.empName })}
                    className={`border ${borderClass} rounded-lg p-2.5 bg-gray-50 flex items-center justify-between text-xs font-semibold transition-all cursor-pointer shadow-3xs active:scale-[0.99] group`}
                    title="Click to view full task details"
                  >
                    <div className="min-w-0 mr-2 flex-1 animate-fadeIn">
                      <span className="font-extrabold text-gray-900 block truncate uppercase leading-tight group-hover:text-blue-600 transition-colors">
                        {t.category} - {t.type}
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold block mt-0.5 uppercase">
                        OWNER: {item.empName}
                      </span>
                    </div>
                    <span className={`min-w-14 text-center py-1 px-1.5 rounded-md border font-extrabold text-[11px] h-fit flex-shrink-0 ${badgeClass}`}>
                      {(Number(t.totalHours) || 0).toFixed(1)}h
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Task Distribution Donut Grid */}
      <div className="bg-white p-5 border border-gray-200 rounded-xl shadow-xs">
        <div className="border-b border-gray-150 pb-3 mb-5 flex items-center">
          <BarChart className="text-blue-600 mr-2 h-5.5 w-5.5" strokeWidth={2.5} />
          <h3 className="font-extrabold text-sm uppercase text-gray-900 tracking-tight leading-none">
            Employee Task Distribution Breakdown
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {personnel.map((p) => (
            <div key={p.id}>{renderEmployeeDonut(p)}</div>
          ))}
        </div>
      </div>

      {/* Efficiency Loss / Total Hours monthly calendars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Total Hours calendrics */}
        <div className="bg-white p-5 border border-gray-200 rounded-xl shadow-xs">
          <div className="border-b border-gray-100 pb-3 mb-4 flex items-center">
            <Calendar className="text-blue-500 mr-2 h-5.5 w-5.5" />
            <h3 className="font-extrabold text-sm uppercase text-gray-900 tracking-tight leading-none">
              Monthly Loaded Hours Record ({selectedYear})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-150 text-center text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase font-extrabold">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  {personnel.map((p) => (
                    <th key={p.name} className="px-3 py-2">
                      {p.name.slice(0, 5)}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-black text-gray-800 bg-gray-100 border-l border-gray-200">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 font-semibold text-gray-700">
                {MONTHS.map((mon, idx) => {
                  let monthlyTotal = 0;
                  return (
                    <tr key={mon} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 text-left font-bold text-gray-900">{mon}</td>
                      {personnel.map((p) => {
                        const hrs = computeMonthlyAggregate(idx, p.id);
                        monthlyTotal += hrs;
                        return (
                          <td key={p.name} className="px-3 py-2 font-mono text-gray-500 font-extrabold text-[11px]">
                            {hrs > 0 ? hrs.toFixed(1) : "—"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 font-black text-blue-700 bg-blue-50/50 border-l border-gray-200 font-mono text-[11px]">
                        {monthlyTotal > 0 ? monthlyTotal.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Efficiency Loss */}
        <div className="bg-white p-5 border border-gray-200 rounded-xl shadow-xs">
          <div className="border-b border-gray-100 pb-3 mb-4 flex items-center">
            <TrendingDown className="text-red-500 mr-2 h-5.5 w-5.5" />
            <h3 className="font-extrabold text-sm uppercase text-gray-900 tracking-tight leading-none">
              Monthly Efficiency Loss (5% penalty &gt; 20h project load)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-150 text-center text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase font-extrabold">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  {personnel.map((p) => (
                    <th key={p.name} className="px-3 py-2">
                      {p.name.slice(0, 5)}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-black text-gray-805 bg-gray-100 border-l border-gray-200">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 font-semibold text-gray-750">
                {MONTHS.map((mon, idx) => {
                  let monthlyTotalLoss = 0;
                  return (
                    <tr key={mon} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 text-left font-bold text-gray-900">{mon}</td>
                      {personnel.map((p) => {
                        const hrs = computeMonthlyAggregate(idx, p.id);
                        const loss = hrs > 20 ? hrs * 0.05 : 0;
                        monthlyTotalLoss += loss;
                        return (
                          <td
                            key={p.name}
                            className={`px-3 py-2 font-mono text-[11px] font-extrabold ${
                              loss > 0 ? "text-red-650" : "text-gray-300"
                            }`}
                          >
                            {loss > 0 ? loss.toFixed(1) : "0.0"}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 font-black text-red-650 bg-red-50/50 border-l border-gray-200 font-mono text-[11px]">
                        {monthlyTotalLoss > 0 ? monthlyTotalLoss.toFixed(1) : "0.0"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Task Details Modal */}
      <AnimatePresence>
        {selectedTaskForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTaskForModal(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-150 max-w-lg w-full overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="bg-blue-600 px-6 py-4 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] bg-blue-700 text-blue-100 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Task #{selectedTaskForModal.task.id}
                  </span>
                  <h2 className="text-base font-extrabold uppercase tracking-tight mt-1">
                    {selectedTaskForModal.task.category}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedTaskForModal(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 space-y-5 overflow-y-auto text-xs font-semibold text-gray-700">
                {/* Meta details */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 font-bold uppercase">Task Type</label>
                    <span className="font-extrabold text-sm text-gray-900 uppercase">
                      {selectedTaskForModal.task.type}
                    </span>
                  </div>
                  <div className="text-right">
                    <label className="block text-[10px] text-gray-400 font-bold uppercase">Task Owner</label>
                    <span className="font-extrabold text-sm text-blue-600 uppercase">
                      {selectedTaskForModal.empName}
                    </span>
                  </div>
                </div>

                {/* Badges / Indicators */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Status</label>
                    {selectedTaskForModal.task.blocked ? (
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-md font-bold uppercase text-[10px]">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Blocked
                      </span>
                    ) : selectedTaskForModal.task.completed || selectedTaskForModal.task.isDone ? (
                      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-md font-bold uppercase text-[10px]">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-md font-bold uppercase text-[10px]">
                        <Activity className="h-3.5 w-3.5 animate-pulse" />
                        In Progress
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Priority</label>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md border font-bold uppercase text-[10px] ${
                      selectedTaskForModal.task.priority === "High"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : selectedTaskForModal.task.priority === "Medium"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-gray-50 text-gray-600 border-gray-200"
                    }`}>
                      {selectedTaskForModal.task.priority || "Normal"}
                    </span>
                  </div>
                </div>

                {/* Metrics Box */}
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase font-sans font-bold block mb-0.5">Total Hours</span>
                    <span className="text-gray-900 font-extrabold text-sm">
                      {(Number(selectedTaskForModal.task.totalHours) || 0).toFixed(1)}h
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase font-sans font-bold block mb-0.5">Quantity / Units</span>
                    <span className="text-gray-900 font-extrabold text-sm">
                      {selectedTaskForModal.task.qty || 1} Units
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase font-sans font-bold block mb-0.5">Eff. (Rate/Unit)</span>
                    <span className="text-gray-900 font-extrabold">
                      {(Number(selectedTaskForModal.task.costPerUnit) || 0).toFixed(2)} hrs
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400 uppercase font-sans font-bold block mb-0.5">Daily Allocation</span>
                    <span className="text-gray-900 font-extrabold">
                      {(Number(selectedTaskForModal.task.dailyRate) || 0).toFixed(2)} h/day
                    </span>
                  </div>
                </div>

                {/* Timeline info */}
                <div className="space-y-2 border-b border-gray-100 pb-3">
                  <h4 className="font-extrabold text-gray-950 uppercase text-[10px] tracking-wider text-gray-400">Schedule & Dates</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-400 block text-[10px]">Start Date</span>
                      <span className="font-bold text-gray-800">{formatLocalDate(selectedTaskForModal.task.start)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px]">End Date</span>
                      <span className="font-bold text-gray-800">{formatLocalDate(selectedTaskForModal.task.end)}</span>
                    </div>
                  </div>
                  {(selectedTaskForModal.task.completedDate || selectedTaskForModal.task.completed) && (
                    <div className="pt-1.5">
                      <span className="text-green-600 block text-[10px]">Completion Date</span>
                      <span className="font-extrabold text-green-700">
                        {formatLocalDate(selectedTaskForModal.task.completedDate || selectedTaskForModal.task.end)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Comments / Details */}
                <div>
                  <h4 className="font-extrabold text-gray-950 uppercase text-[10px] tracking-wider text-gray-400 mb-1.5">Comments & details</h4>
                  <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl whitespace-pre-wrap text-gray-650 font-medium leading-[normal] select-text">
                    {selectedTaskForModal.task.details || "No operational log description is specified or recorded."}
                  </div>
                </div>

                {/* Log history */}
                {selectedTaskForModal.task.history && selectedTaskForModal.task.history.length > 0 && (
                  <div>
                    <h4 className="font-extrabold text-gray-950 uppercase text-[10px] tracking-wider text-gray-400 mb-2">History & Actions</h4>
                    <div className="max-h-28 overflow-y-auto pr-1 space-y-2 text-[10px] font-mono border-l border-gray-200 pl-3 ml-1.5">
                      {selectedTaskForModal.task.history.map((h, i) => (
                        <div key={i} className="relative">
                          <div className="absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full bg-gray-300 border-2 border-white" />
                          <span className="text-gray-400 select-none">{formatLocalDate(h.date)}: </span>
                          <span className="text-gray-700 font-semibold">{h.action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 border-t border-gray-100 px-6 py-3.5 flex justify-end">
                <button
                  onClick={() => setSelectedTaskForModal(null)}
                  className="px-4 py-2 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-lg tracking-wide uppercase text-[11px] transition-colors cursor-pointer"
                >
                  Close Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
