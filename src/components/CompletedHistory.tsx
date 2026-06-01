/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Employee, Task } from "../types";
import { CheckCircle2, RotateCcw, AlertCircle, Search, Calendar, RefreshCcw } from "lucide-react";

interface CompletedHistoryProps {
  personnel: Employee[];
  onReopenTask: (pId: number, tId: number) => Promise<void>;
}

export default function CompletedHistory({ personnel, onReopenTask }: CompletedHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDept, setFilterDept] = useState<"all" | "eng" | "qual">("all");

  // Collect all completed tasks
  const completedHistory: {
    pId: number;
    empName: string;
    empDept: "eng" | "qual";
    task: Task;
  }[] = [];

  personnel.forEach((p) => {
    p.tasks.forEach((t) => {
      if (t.completed || t.isDone) {
        completedHistory.push({
          pId: p.id,
          empName: p.name,
          empDept: p.dept,
          task: t,
        });
      }
    });
  });

  // Sort history newest first
  completedHistory.sort((a, b) => {
    const timeA = a.task.completedDate?.toDate ? a.task.completedDate.toDate().getTime() : (a.task.completedDate ? new Date(a.task.completedDate).getTime() : 0);
    const timeB = b.task.completedDate?.toDate ? b.task.completedDate.toDate().getTime() : (b.task.completedDate ? new Date(b.task.completedDate).getTime() : 0);
    return timeB - timeA;
  });

  const filteredHistory = completedHistory.filter((item) => {
    // Dept filter
    if (filterDept !== "all" && item.empDept !== filterDept) return false;

    // Search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      const matchName = item.empName.toLowerCase().includes(query);
      const matchCat = item.task.category.toLowerCase().includes(query);
      const matchType = item.task.type.toLowerCase().includes(query);
      return matchName || matchCat || matchType;
    }

    return true;
  });

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <CheckCircle2 className="text-green-600 mr-2 h-5 w-5" />
            Master Completed History
          </h3>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            Browse fully processed tasks, timelines, and status metrics across all personnel.
          </p>
        </div>

        {/* Filter bars */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Dept filters */}
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700 font-semibold focus:outline-none"
          >
            <option value="all">All Departments</option>
            <option value="eng">Engineering</option>
            <option value="qual">Quality</option>
          </select>

          {/* Search bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Search employee or task..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none w-52 focus:w-64 transition-all"
            />
          </div>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="text-center py-12 text-gray-400 font-medium">
          No records matching selected filter criteria.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left">Employee</th>
                <th className="px-6 py-3 text-left">Product / Category</th>
                <th className="px-6 py-3 text-left">Task Description</th>
                <th className="px-6 py-3 text-center">Output</th>
                <th className="px-6 py-3 text-center">Work Hrs</th>
                <th className="px-6 py-3 text-center">Completion Date</th>
                <th className="px-6 py-3 text-center">Status</th>
                <th className="px-6 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-250 font-medium">
              {filteredHistory.map((item) => {
                const isLate = item.task.status === "Late" || item.task.completedDate > item.task.end;
                const completedDate = item.task.completedDate?.toDate
                  ? item.task.completedDate.toDate()
                  : (item.task.completedDate ? new Date(item.task.completedDate) : null);

                return (
                  <tr key={item.task.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-gray-900 uppercase">
                          {item.empName}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                          {item.empDept === "eng" ? "Engineering" : "Quality"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700 italic">
                      {item.task.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 uppercase">
                      {item.task.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-600">
                      {item.task.qty} units
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center font-bold text-gray-800">
                      {item.task.totalHours?.toFixed(1) || "—"} h
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs text-gray-400">
                      <div className="flex items-center justify-center gap-1.5 font-bold">
                        <Calendar className="h-3.5 w-3.5" />
                        {completedDate ? completedDate.toLocaleDateString() : "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold shadow-3xs inline-flex items-center gap-1 border ${
                          isLate
                            ? "bg-red-50 border-red-200 text-red-700"
                            : "bg-green-50 border-green-200 text-green-700"
                        }`}
                      >
                        {isLate ? (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            Late
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            On Time
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to reopen "${item.task.category} - ${item.task.type}" for ${item.empName}?`
                            )
                          ) {
                            onReopenTask(item.pId, item.task.id);
                          }
                        }}
                        className="px-3 py-1 bg-white border border-gray-250 text-gray-500 hover:text-blue-600 hover:border-blue-400 rounded-lg text-xs font-bold shadow-3xs inline-flex items-center transition-all cursor-pointer"
                        title="Re-open / push back to active schedule"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Re-open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
