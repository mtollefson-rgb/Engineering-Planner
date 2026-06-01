/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HistoryItem {
  date: any; // Can be Date or Firebase Timestamp
  action: string;
}

export interface Task {
  id: number;
  category: string;
  type: string;
  qty: number;
  start: any; // Can be Date or Firebase Timestamp
  end: any;   // Can be Date or Firebase Timestamp
  completedDate: any | null;
  totalHours: number;
  dailyRate: number;
  costPerUnit: number;
  priority: "Low" | "Medium" | "High";
  blocked: boolean;
  completed: boolean;
  isDone?: boolean; // For backwards compatibility
  status?: string;   // "On Time" | "Late"
  details?: string;
  history: HistoryItem[];
}

export interface Employee {
  id: number;
  name: string;
  role: string;
  dept: "eng" | "qual";
  tasks: Task[];
}

export interface SampleOrder {
  date: string;
  product: string;
  qty: number;
}

export interface Subtask {
  name: string;
  hours: number;
}
