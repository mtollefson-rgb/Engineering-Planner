/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  isOfflineMode,
  setOfflineMode
} from "./firebase";
import { Employee, Task, SampleOrder, TaskTypeConfig } from "./types";

const DEFAULT_TASK_TYPES: Record<string, TaskTypeConfig> = {
  "Comparison": { dept: "eng", trackingType: "number" },
  "Engineering Design": { dept: "eng", trackingType: "number" },
  "Product Testing": { dept: "eng", trackingType: "number" },
  "Calibration": { dept: "eng", trackingType: "number" },
  "Attribute Fill-in": { dept: "eng", trackingType: "number" },
  "Customer Feedback": { dept: "eng", trackingType: "number" },
  "Research Assignment": { dept: "eng", trackingType: "number" },
  "NAPA Tech Line": { dept: "qual", trackingType: "number" },
  "Warranty Claims": { dept: "qual", trackingType: "number" },
  "Quarantine": { dept: "qual", trackingType: "number" },
  "SOPs": { dept: "qual", trackingType: "number" },
  "Quality Issues": { dept: "qual", trackingType: "number" },
  "Time Studies": { dept: "qual", trackingType: "number" },
  "Quality Alerts": { dept: "qual", trackingType: "number" },
  "Recalls": { dept: "qual", trackingType: "number" },
  "Meeting": { dept: "both", trackingType: "hours" },
  "Other": { dept: "both", trackingType: "hours" },
  "PTO": { dept: "both", trackingType: "hours" },
  "Holiday": { dept: "both", trackingType: "hours" },
};

// Component imports
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import CompletedHistory from "./components/CompletedHistory";
import Samples from "./components/Samples";
import Calculator from "./components/Calculator";
import TimeStandards from "./components/TimeStandards";
import TeamManagement from "./components/TeamManagement";
import ExecutiveDashboard from "./components/ExecutiveDashboard";

// Lucid Icons
import {
  Calendar,
  LogOut,
  Users,
  Settings,
  Calculator as CalcIcon,
  BarChart,
  Grid,
  CheckSquare,
  Package,
  Layers,
  Sparkle,
} from "lucide-react";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Shared Data States loaded from Firestore
  const [personnel, setPersonnel] = useState<Employee[]>([]);
  const [categoryCosts, setCategoryCosts] = useState<Record<string, Record<string, number>>>({});
  const [taskBreakdowns, setTaskBreakdowns] = useState<Record<string, Record<string, any>>>({});
  const [taskTypes, setTaskTypes] = useState<Record<string, TaskTypeConfig>>({});
  const [sampleOrders, setSampleOrders] = useState<SampleOrder[]>([]);
  const [sampleTargets, setSampleTargets] = useState<Record<string, number>>({});

  // Active user tab
  const [activeTab, setActiveTab] = useState<
    "eng" | "qual" | "completed" | "samples" | "calculator" | "standards" | "team" | "exec"
  >("eng");

  // Scheduling standard base dates
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));

  // 1. Initial Authentication observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // 2. Active Firestore subscriptions
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    // Run dynamic seeds
    initDatabase().then(() => {
      // Connect listening snapshots
      const unsubPersonnel = onSnapshot(
        collection(db, "personnel"),
        (snap) => {
          const list: Employee[] = [];
          snap.forEach((d) => {
            const data = d.data();
            const info = data.info || {};
            const rawTasks = data.tasks || [];

            const tasks: Task[] = rawTasks.map((t: any) => {
              const start = t.start?.toDate ? t.start.toDate() : new Date(t.start);
              const end = t.end?.toDate ? t.end.toDate() : new Date(t.end);
              const completedDate = t.completedDate?.toDate
                ? t.completedDate.toDate()
                : t.completedDate
                  ? new Date(t.completedDate)
                  : null;

              return {
                ...t,
                start,
                end,
                completedDate,
                history: (t.history || []).map((h: any) => ({
                  ...h,
                  date: h.date?.toDate ? h.date.toDate() : new Date(h.date),
                })),
              };
            });

            list.push({
              id: Number(d.id),
              name: info.name || "",
              role: info.role || "",
              dept: info.dept || "eng",
              tasks,
            });
          });

          // Sort directory alphabetically
          list.sort((a, b) => a.name.localeCompare(b.name));
          setPersonnel(list);
          setLoading(false);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "personnel");
        }
      );

      const unsubStandards = onSnapshot(
        doc(db, "config", "standards"),
        (d) => {
          if (d.exists()) {
            const data = d.data();
            setCategoryCosts(data.costs || {});
            setTaskBreakdowns(data.breakdowns || {});
            setTaskTypes(data.taskTypes || DEFAULT_TASK_TYPES);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "config/standards");
        }
      );

      const unsubSamples = onSnapshot(
        doc(db, "config", "samples"),
        (d) => {
          if (d.exists()) {
            const data = d.data();
            setSampleOrders(data.orders || []);
            setSampleTargets(data.targets || {});
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, "config/samples");
        }
      );

      return () => {
        unsubPersonnel();
        unsubStandards();
        unsubSamples();
      };
    });
  }, [currentUser]);

  // Seeding Default Tables
  const initDatabase = async () => {
    try {
      // Create defaults mapping dictionary for product workloads
      const defaultCosts: Record<string, Record<string, number>> = {};
      const DEFAULT_PRODUCTS = [
        "Air Shocks & Struts",
        "Air Compressors",
        "Valve Blocks",
        "Electric Lift Supports",
        "Coil Springs",
        "Complete Strut Assemblies",
        "Shock Absorbers",
        "Fuel Pumps",
        "Brake Wear Sensors",
        "Lift Supports",
        "GDI Pumps",
        "MAF",
        "O2 Sensors",
        "Fuel Injectors",
      ];

      DEFAULT_PRODUCTS.forEach((p) => {
        defaultCosts[p] = {
          "Comparison": p.includes("Struts") ? 3 : p.includes("Strut") ? 2 : 1,
          "Engineering Design": 2,
          "Product Testing": 2,
          "Calibration": 2.0, // Our new Calibration item integrated with a 2-hour base default standard!
          "Attribute Fill-in": 1,
          "Customer Feedback": 1,
          "Research Assignment": 1,
          "NAPA Tech Line": 1.5,
          "Warranty Claims": 1,
          "Quarantine": 1,
          "SOPs": 1,
          "Quality Issues": 1.5,
          "Time Studies": 1,
          "Quality Alerts": 1,
          "Recalls": 2,
        };
      });

      // Standards Config document Seeder
      const confRef = doc(db, "config", "standards");
      const confSnap = await getDoc(confRef);
      if (!confSnap.exists()) {
        await setDoc(confRef, { costs: defaultCosts, breakdowns: {}, taskTypes: DEFAULT_TASK_TYPES });
      } else {
        // Enforce Calibration exists incrementally under all standard products
        const data = confSnap.data();
        const existingCosts = data.costs || {};
        let updateNeeded = false;

        Object.keys(defaultCosts).forEach((prod) => {
          if (!existingCosts[prod]) {
            existingCosts[prod] = defaultCosts[prod];
            updateNeeded = true;
          } else {
            if (existingCosts[prod]["Calibration"] === undefined) {
              existingCosts[prod]["Calibration"] = 2.0; // Apply default standard base hours
              updateNeeded = true;
            }
          }
        });

        if (!data.taskTypes) {
          updateNeeded = true;
        }

        if (updateNeeded) {
          await updateDoc(confRef, {
            costs: existingCosts,
            taskTypes: data.taskTypes || DEFAULT_TASK_TYPES
          });
        }
      }

      // Samples Collection setup
      const samplesRef = doc(db, "config", "samples");
      const samplesSnap = await getDoc(samplesRef);
      if (!samplesSnap.exists()) {
        await setDoc(samplesRef, { orders: [], targets: {} });
      }

      // Personnel Default Seed
      const initialEmployees = [
        { id: 0, name: "MAXWELL", role: "Eng 1", dept: "eng" },
        { id: 1, name: "LEE", role: "Eng 2", dept: "eng" },
        { id: 2, name: "JORDON", role: "Eng 3", dept: "eng" },
        { id: 3, name: "TIM", role: "Lab Tech", dept: "eng" },
        { id: 4, name: "RON", role: "Quality Mgr", dept: "qual" },
        { id: 5, name: "GLEN", role: "Quality Tech", dept: "qual" },
      ];

      for (const emp of initialEmployees) {
        const empRef = doc(db, "personnel", String(emp.id));
        const snap = await getDoc(empRef);
        if (!snap.exists()) {
          await setDoc(empRef, { info: emp, tasks: [] });
        }
      }
    } catch (e) {
      console.error("Database seed failure: ", e);
    }
  };

  // Auth logout handler
  const handleSignOut = () => {
    signOut(auth).then(() => {
      setCurrentUser(null);
      setPersonnel([]);
    });
  };

  // Nav helpers
  const handleWeekChange = (dir: number) => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + dir * 7);
      return next;
    });
  };

  // Standard Task addition controller
  const handleAddNewTask = async (
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
  ) => {
    const employee = personnel.find((p) => p.id === pId);
    if (!employee) return;

    let baseCost = categoryCosts[taskData.category]?.[taskData.type] ?? 1.0;
    if (taskData.manualHours !== undefined) {
      baseCost = taskData.manualHours / taskData.qty;
    }

    const totalHours = baseCost * taskData.qty;
    const duration =
      (taskData.end.getTime() - taskData.start.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const dailyRate = totalHours / Math.max(1, duration);

    const newTask: Task = {
      id: Date.now(),
      category: taskData.category,
      type: taskData.type,
      qty: taskData.qty,
      start: taskData.start,
      end: taskData.end,
      completedDate: null,
      totalHours,
      dailyRate,
      costPerUnit: baseCost,
      priority: taskData.priority,
      blocked: false,
      completed: false,
      details: taskData.details,
      history: [
        {
          date: new Date(),
          action: "Assignment Logged",
        },
      ],
    };

    try {
      const ref = doc(db, "personnel", String(pId));
      const updatedTasks = [...employee.tasks, newTask];
      await updateDoc(ref, { tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/${pId}`);
    }
  };

  // Actions statuses modifier
  const handleUpdateTaskStatus = async (pId: number, tId: number, action: string) => {
    const employee = personnel.find((p) => p.id === pId);
    if (!employee) return;

    const updatedTasks = employee.tasks
      .map((t) => {
        if (t.id === tId) {
          const updated = { ...t };
          if (action === "complete") {
            updated.completed = true;
            updated.isDone = true;
            const compDate = new Date();
            updated.completedDate = compDate;

            const taskEnd = new Date(t.end);
            taskEnd.setHours(23, 59, 59, 999);
            updated.status = compDate.getTime() <= taskEnd.getTime() ? "On Time" : "Late";
            updated.history = [
              ...(t.history || []),
              { date: new Date(), action: "Deliverable Approved Completed" },
            ];
          } else if (action === "unblock") {
            updated.blocked = false;
            updated.history = [
              ...(t.history || []),
              { date: new Date(), action: "Deliverable Block Lifted" },
            ];
          }
          return updated;
        }
        return t;
      })
      .filter((t) => !(t.id === tId && action === "delete"));

    try {
      const ref = doc(db, "personnel", String(pId));
      await updateDoc(ref, { tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/${pId}`);
    }
  };

  // Edit details handler
  const handleEditTask = async (
    pId: number,
    tId: number,
    start: Date,
    end: Date,
    details: string
  ) => {
    const employee = personnel.find((p) => p.id === pId);
    if (!employee) return;

    const updatedTasks = employee.tasks.map((t) => {
      if (t.id === tId) {
        const u = { ...t };
        u.start = start;
        u.end = end;
        u.details = details;

        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
        u.dailyRate = u.totalHours / Math.max(1, duration);
        u.history = [...(t.history || []), { date: new Date(), action: "Task Properties Edited" }];
        return u;
      }
      return t;
    });

    try {
      const ref = doc(db, "personnel", String(pId));
      await updateDoc(ref, { tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/${pId}`);
    }
  };

  // Block flag setter
  const handleBlockTask = async (pId: number, tId: number, reason: string) => {
    const employee = personnel.find((p) => p.id === pId);
    if (!employee) return;

    const updatedTasks = employee.tasks.map((t) => {
      if (t.id === tId) {
        const u = { ...t };
        u.blocked = true;
        u.history = [
          ...(t.history || []),
          { date: new Date(), action: `Deliverable Blocked: ${reason}` },
        ];
        return u;
      }
      return t;
    });

    try {
      const ref = doc(db, "personnel", String(pId));
      await updateDoc(ref, { tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/${pId}`);
    }
  };

  // Reopen Completed Task logger
  const handleReopenTask = async (pId: number, tId: number) => {
    const employee = personnel.find((p) => p.id === pId);
    if (!employee) return;

    const updatedTasks = employee.tasks.map((t) => {
      if (t.id === tId) {
        const u = { ...t };
        u.completed = false;
        u.isDone = false;
        u.completedDate = null;
        u.status = "";
        u.history = [...(t.history || []), { date: new Date(), action: "Assignment Reopened" }];
        return u;
      }
      return t;
    });

    try {
      const ref = doc(db, "personnel", String(pId));
      await updateDoc(ref, { tasks: updatedTasks });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `personnel/${pId}`);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl p-4 bg-white border border-gray-150 animate-bounce shadow-xs">
            <Sparkle className="h-10 w-10 text-blue-600 animate-spin" />
          </div>
          <span className="text-sm font-extrabold text-gray-500 uppercase tracking-widest text-[11px]">
            Checking Authentication Credentials...
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoading={setLoading} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col antialiased selection:bg-blue-100 pb-12">
      {/* Dynamic boot load screen */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-xs flex flex-col justify-center items-center">
          <div className="animate-pulse bg-blue-600 p-3 rounded-2xl text-white shadow-xl mb-4">
            <Sparkle className="h-8 w-8 animate-spin" />
          </div>
          <span className="text-xs uppercase tracking-widest text-blue-600 font-black">
            Synchronizing Records Data Stream...
          </span>
        </div>
      )}

      {/* Main visual header bar */}
      <header className="bg-white border-b border-gray-150 shadow-3xs px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-black tracking-tight text-gray-900 uppercase flex items-center gap-2">
            <Grid className="text-blue-600 h-6 w-6" />
            Dept. Resource &amp; Quality Planner
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isOfflineMode() && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center animate-pulse uppercase">
                ⚠️ DEMO MODE (LOCAL OFFLINE STORAGE)
              </span>
              <button
                onClick={() => {
                  setOfflineMode(false);
                  window.location.reload();
                }}
                className="text-[11px] px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg hover:border-blue-450 transition-all font-black uppercase cursor-pointer shadow-3xs"
                title="Disconnect Local storage backend and switch back to Firebase operations"
              >
                Connect Firebase
              </button>
            </div>
          )}
          <span className="text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center">
            Signed in as: <strong className="ml-1 uppercase text-blue-600">{currentUser.email?.split("@")[0]}</strong>
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-3xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Navigation tabs header */}
        <div className="overflow-x-auto">
          <div className="flex gap-1.5 p-1 bg-gray-200/50 rounded-xl border border-gray-150 shadow-3xs w-max md:w-full">
            <button
              onClick={() => setActiveTab("eng")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "eng"
                  ? "bg-blue-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Engineering Schedule
            </button>

            <button
              onClick={() => setActiveTab("qual")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "qual"
                  ? "bg-purple-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Quality Schedule
            </button>

            <button
              onClick={() => setActiveTab("completed")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "completed"
                  ? "bg-green-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              Archives
            </button>

            <button
              onClick={() => setActiveTab("samples")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "samples"
                  ? "bg-indigo-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <Package className="h-4 w-4" />
              Sample Tracker
            </button>

            <button
              onClick={() => setActiveTab("calculator")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "calculator"
                  ? "bg-emerald-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <CalcIcon className="h-4 w-4" />
              Estimator
            </button>

            <button
              onClick={() => setActiveTab("standards")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "standards"
                  ? "bg-teal-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <Settings className="h-4 w-4" />
              Time Standards
            </button>

            <button
              onClick={() => setActiveTab("team")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "team"
                  ? "bg-orange-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <Users className="h-4 w-4" />
              Team Directory
            </button>

            <button
              onClick={() => setActiveTab("exec")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-all uppercase cursor-pointer ${
                activeTab === "exec"
                  ? "bg-pink-600 text-white shadow-xs font-black"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <BarChart className="h-4 w-4" />
              Analytics
            </button>
          </div>
        </div>

        {/* Dynamic page tab mount point with fade action */}
        <div className="animation-fadeIn">
          {activeTab === "eng" && (
            <Dashboard
              personnel={personnel}
              activeDept="eng"
              currentWeekStart={currentWeekStart}
              onChangeWeek={handleWeekChange}
              categoryCosts={categoryCosts}
              onAddTask={handleAddNewTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onEditTask={handleEditTask}
              onBlockTask={handleBlockTask}
              taskTypes={taskTypes}
            />
          )}

          {activeTab === "qual" && (
            <Dashboard
              personnel={personnel}
              activeDept="qual"
              currentWeekStart={currentWeekStart}
              onChangeWeek={handleWeekChange}
              categoryCosts={categoryCosts}
              onAddTask={handleAddNewTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onEditTask={handleEditTask}
              onBlockTask={handleBlockTask}
              taskTypes={taskTypes}
            />
          )}

          {activeTab === "completed" && (
            <CompletedHistory personnel={personnel} onReopenTask={handleReopenTask} />
          )}

          {activeTab === "samples" && (
            <Samples
              categoryCosts={categoryCosts}
              sampleOrders={sampleOrders}
              sampleTargets={sampleTargets}
              onRefresh={() => {}}
            />
          )}

          {activeTab === "calculator" && (
            <Calculator
              personnel={personnel}
              categoryCosts={categoryCosts}
              onAddTask={handleAddNewTask}
              taskTypes={taskTypes}
            />
          )}

          {activeTab === "standards" && (
            <TimeStandards
              personnel={personnel}
              categoryCosts={categoryCosts}
              taskBreakdowns={taskBreakdowns}
              onRefresh={() => {}}
              taskTypes={taskTypes}
            />
          )}

          {activeTab === "team" && (
            <TeamManagement personnel={personnel} onRefresh={() => {}} />
          )}

          {activeTab === "exec" && <ExecutiveDashboard personnel={personnel} />}
        </div>
      </main>
    </div>
  );
}
