/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Employee, Task } from "../types";
import { Calendar, Award, TrendingDown, Clock, ShieldAlert, BarChart } from "lucide-react";

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

  const years = [2025, 2026, 2027];

  // Helper to extract timestamp date
  const parseTaskDate = (d: any): Date | null => {
    if (!d) return null;
    if (d.toDate) return d.toDate();
    return new Date(d);
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
    category: string;
    type: string;
    hours: number;
    completed: boolean;
  }[] = [];

  personnel.forEach((p) => {
    p.tasks.forEach((t) => {
      const startD = parseTaskDate(t.start);
      if (startD && startD.getFullYear() === selectedYear) {
        if (selectedMonth === "All" || startD.getMonth() === selectedMonth) {
          allTasksMatched.push({
            empName: p.name,
            category: t.category,
            type: t.type,
            hours: Number(t.totalHours) || 0,
            completed: t.completed || t.isDone || false,
          });
        }
      }
    });
  });

  const topTimeConsumers = [...allTasksMatched]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

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
        <div className="bg-white p-5 border border-gray-200 rounded-xl shadow-xs flex flex-col justify-between">
          <div className="border-b border-gray-100 pb-3 mb-4 flex items-center">
            <Clock className="text-amber-500 mr-2 h-5.5 w-5.5" />
            <h3 className="font-extrabold text-sm uppercase text-gray-900 tracking-tight leading-none">
              Top Time Consumers
            </h3>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-52">
            {topTimeConsumers.length === 0 ? (
              <p className="text-gray-400 italic text-center py-8 text-xs font-medium">
                No hours logged matching filters.
              </p>
            ) : (
                topTimeConsumers.map((t, idx) => (
                  <div key={idx} className="border border-gray-150 rounded-lg p-2.5 bg-gray-50 flex items-center justify-between text-xs font-semibold">
                    <div className="min-w-0">
                      <span className="font-extrabold text-gray-900 block truncate uppercase leading-tight">
                        {t.category} - {t.type}
                      </span>
                      <span className="text-[10px] text-gray-400 font-bold block mt-0.5 uppercase">
                        OWNER: {t.empName}
                      </span>
                    </div>
                    <span className="bg-blue-50 text-blue-700 min-w-14 text-center py-1 rounded-md border border-blue-200 font-extrabold text-[11px] h-fit flex-shrink-0">
                      {t.hours.toFixed(1)}h
                    </span>
                  </div>
                ))
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
    </div>
  );
}
