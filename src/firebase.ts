/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged as fOnAuthStateChanged, 
  signOut as fSignOut 
} from "firebase/auth";
import { 
  getFirestore,
  collection as fCollection,
  doc as fDoc,
  setDoc as fSetDoc,
  updateDoc as fUpdateDoc,
  deleteDoc as fDeleteDoc,
  onSnapshot as fOnSnapshot,
  arrayUnion as fArrayUnion,
  getDoc as fGetDoc
} from "firebase/firestore";

// Read from injected config if possible, fallback to custom credentials from legacy HTML
const firebaseConfig = {
  apiKey: "AIzaSyDxQrOoHYKqPn1lJ52NW1XvDB05PpNGwKU",
  authDomain: "engineering-task-tracker.firebaseapp.com",
  projectId: "engineering-task-tracker",
  storageBucket: "engineering-task-tracker.firebasestorage.app",
  messagingSenderId: "881070104494",
  appId: "1:881070104494:web:1ded65fe520f3e5817723f",
  measurementId: "G-5TF7EYQ4YC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Check if running in offline bypass/demo mode
export function isOfflineMode(): boolean {
  return localStorage.getItem("isOfflineMode") === "true";
}

// Enable/disable offline mode
export function setOfflineMode(enabled: boolean): void {
  localStorage.setItem("isOfflineMode", enabled ? "true" : "false");
  if (!enabled) {
    localStorage.removeItem("offline_user");
  }
}

// Reactive listeners registry for mock onSnapshot
interface MockListener {
  id: string;
  path: string;
  isCollection: boolean;
  callback: (snapshot: any) => void;
}
const mockListeners: MockListener[] = [];

// Load the offline database dictionary
const getOfflineDb = (): any => {
  const data = localStorage.getItem("offline_db");
  const defaultTaskTypes = {
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
    "Holiday": { dept: "both", trackingType: "hours" }
  };

  if (data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed?.config?.standards) {
        if (!parsed.config.standards.taskTypes) {
          parsed.config.standards.taskTypes = defaultTaskTypes;
          localStorage.setItem("offline_db", JSON.stringify(parsed));
        }
      }
      return parsed;
    } catch (e) {
      // ignore JSON parse error
    }
  }

  // Initial Seed Workloads
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
      "Calibration": 2.0,
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

  const seed = {
    personnel: {
      "0": { info: { id: 0, name: "MAXWELL", role: "Eng 1", dept: "eng" }, tasks: [] },
      "1": { info: { id: 1, name: "LEE", role: "Eng 2", dept: "eng" }, tasks: [] },
      "2": { info: { id: 2, name: "JORDON", role: "Eng 3", dept: "eng" }, tasks: [] },
      "3": { info: { id: 3, name: "TIM", role: "Lab Tech", dept: "eng" }, tasks: [] },
      "4": { info: { id: 4, name: "RON", role: "Quality Mgr", dept: "qual" }, tasks: [] },
      "5": { info: { id: 5, name: "GLEN", role: "Quality Tech", dept: "qual" }, tasks: [] }
    },
    config: {
      standards: { costs: defaultCosts, breakdowns: {}, taskTypes: defaultTaskTypes },
      samples: { orders: [], targets: {} }
    }
  };

  localStorage.setItem("offline_db", JSON.stringify(seed));
  return seed;
};

// Save database dictionary and broadcast changes to active subscription queries
const saveOfflineDb = (dbState: any): void => {
  localStorage.setItem("offline_db", JSON.stringify(dbState));
  triggerMockListeners();
};

const triggerMockListeners = (): void => {
  const dbState = getOfflineDb();
  mockListeners.forEach((listener) => {
    const parts = listener.path.split("/");
    let current = dbState;
    let found = true;
    for (const key of parts) {
      if (current && typeof current === "object" && key in current) {
        current = current[key];
      } else {
        found = false;
        break;
      }
    }

    if (listener.isCollection) {
      const list = Object.keys(current || {}).map((key) => {
        const item = current[key];
        return {
          id: key,
          data: () => item
        };
      });
      listener.callback({
        get size() { return list.length; },
        get empty() { return list.length === 0; },
        forEach: (cb: any) => list.forEach(cb),
        docs: list
      });
    } else {
      listener.callback({
        exists: () => found && current !== undefined,
        data: () => current
      });
    }
  });
};

// Intercepted wrapper of Firestore Document Fetcher
export async function getDoc(docRef: any): Promise<any> {
  if (isOfflineMode()) {
    const dbState = getOfflineDb();
    const parts = docRef.path.split("/");
    let current = dbState;
    let found = true;
    for (const key of parts) {
      if (current && typeof current === "object" && key in current) {
        current = current[key];
      } else {
        found = false;
        break;
      }
    }
    return {
      exists: () => found && current !== undefined,
      data: () => current
    };
  }
  return fGetDoc(docRef);
}

// Intercepted wrapper of Firestore Collection Reference creator
export function collection(dbRef: any, path: string, ...segments: string[]): any {
  if (isOfflineMode()) {
    const fullPath = [path, ...segments].filter(Boolean).join("/");
    return { _isMock: true, path: fullPath, isCollection: true };
  }
  return fCollection(dbRef, path, ...segments);
}

// Intercepted wrapper of Firestore Document Reference creator
export function doc(dbRef: any, path: string, ...segments: string[]): any {
  if (isOfflineMode()) {
    const fullPath = [path, ...segments].filter(Boolean).join("/");
    return { _isMock: true, path: fullPath, isCollection: false };
  }
  return fDoc(dbRef, path, ...segments);
}

// Intercepted wrapper of Firestore Document Set Writer
export async function setDoc(docRef: any, data: any): Promise<void> {
  if (isOfflineMode()) {
    const dbState = getOfflineDb();
    const parts = docRef.path.split("/");
    
    let current = dbState;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!current[p]) current[p] = {};
      current = current[p];
    }
    const lastKey = parts[parts.length - 1];
    current[lastKey] = data;
    
    saveOfflineDb(dbState);
    return;
  }
  return fSetDoc(docRef, data);
}

// Intercepted wrapper of Firestore Document Field Updater
export async function updateDoc(docRef: any, data: any): Promise<void> {
  if (isOfflineMode()) {
    const dbState = getOfflineDb();
    const parts = docRef.path.split("/");
    
    let current = dbState;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!current[p]) current[p] = {};
      current = current[p];
    }
    const lastKey = parts[parts.length - 1];
    if (!current[lastKey]) current[lastKey] = {};
    
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value && typeof value === "object" && value._isUnion) {
        if (!Array.isArray(current[lastKey][key])) {
          current[lastKey][key] = [];
        }
        value.elements.forEach((el: any) => {
          current[lastKey][key].push(el);
        });
      } else {
        current[lastKey][key] = value;
      }
    });
    
    saveOfflineDb(dbState);
    return;
  }
  return fUpdateDoc(docRef, data);
}

// Intercepted wrapper of Firestore Document Deleter
export async function deleteDoc(docRef: any): Promise<void> {
  if (isOfflineMode()) {
    const dbState = getOfflineDb();
    const parts = docRef.path.split("/");
    
    let current = dbState;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!current[p]) current[p] = {};
      current = current[p];
    }
    const lastKey = parts[parts.length - 1];
    delete current[lastKey];
    
    saveOfflineDb(dbState);
    return;
  }
  return fDeleteDoc(docRef);
}

// Intercepted wrapper of Firestore Live Listener subscription
export function onSnapshot(ref: any, onNext: any, onError?: any): any {
  if (isOfflineMode()) {
    const listenerId = String(Math.random());
    const listener: MockListener = {
      id: listenerId,
      path: ref.path,
      isCollection: ref.isCollection,
      callback: onNext
    };
    mockListeners.push(listener);
    
    // Trigger initial emission
    setTimeout(() => {
      const dbState = getOfflineDb();
      const parts = ref.path.split("/");
      let current = dbState;
      let found = true;
      for (const key of parts) {
        if (current && typeof current === "object" && key in current) {
          current = current[key];
        } else {
          found = false;
          break;
        }
      }

      if (ref.isCollection) {
        const list = Object.keys(current || {}).map((key) => {
          const item = current[key];
          return {
            id: key,
            data: () => item
          };
        });
        onNext({
          get size() { return list.length; },
          get empty() { return list.length === 0; },
          forEach: (cb: any) => list.forEach(cb),
          docs: list
        });
      } else {
        onNext({
          exists: () => found && current !== undefined,
          data: () => current
        });
      }
    }, 20);
    
    return () => {
      const idx = mockListeners.findIndex((l) => l.id === listenerId);
      if (idx !== -1) {
        mockListeners.splice(idx, 1);
      }
    };
  }
  return fOnSnapshot(ref, onNext, onError);
}

// Intercepted wrapper of Array Union operation
export function arrayUnion(...elements: any[]): any {
  if (isOfflineMode()) {
    return { _isUnion: true, elements };
  }
  return fArrayUnion(...elements);
}

// Intercepted wrapper of Authentication state changed observer
const authListeners: ((user: any) => void)[] = [];
export function onAuthStateChanged(authInstance: any, callback: any): any {
  if (isOfflineMode()) {
    authListeners.push(callback);
    
    const saved = localStorage.getItem("offline_user");
    const user = saved ? JSON.parse(saved) : null;
    
    setTimeout(() => {
      callback(user);
    }, 20);
    
    return () => {
      const idx = authListeners.indexOf(callback);
      if (idx !== -1) {
        authListeners.splice(idx, 1);
      }
    };
  }
  return fOnAuthStateChanged(authInstance, callback);
}

// Intercepted wrapper of Sign Out logout logic
export function signOut(authInstance: any): Promise<void> {
  if (isOfflineMode()) {
    localStorage.removeItem("offline_user");
    authListeners.forEach((cb) => cb(null));
    return Promise.resolve();
  }
  return fSignOut(authInstance);
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
