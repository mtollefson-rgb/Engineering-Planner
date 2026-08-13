/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SampleOrder, SampleEditHistory } from "../types";
import { doc, updateDoc, arrayUnion, db, handleFirestoreError, OperationType } from "../firebase";
import {
  Calendar,
  Package,
  Plus,
  Target,
  CheckCircle,
  Eye,
  Edit3,
  History,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  AlertCircle,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SamplesProps {
  categoryCosts: Record<string, Record<string, number>>;
  sampleOrders: SampleOrder[];
  sampleTargets: Record<string, number>;
  onRefresh: () => void;
  currentUserEmail?: string;
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

export default function Samples({
  categoryCosts,
  sampleOrders,
  sampleTargets,
  onRefresh,
  currentUserEmail,
}: SamplesProps) {
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedProd, setSelectedProd] = useState("");
  const [qty, setQty] = useState(1);
  const [successMsg, setSuccessMsg] = useState("");
  const [hoveredMonths, setHoveredMonths] = useState<Record<string, number | null>>({});
  const [visibleProducts, setVisibleProducts] = useState<string[] | null>(null);

  // State for Editing Sample Quantity & Audit History
  const [editingOrder, setEditingOrder] = useState<SampleOrder | null>(null);
  const [editingOrderIndex, setEditingOrderIndex] = useState<number | null>(null);
  const [newQtyInput, setNewQtyInput] = useState<number>(1);
  const [editReasonInput, setEditReasonInput] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Dedicated Audit History Modal State
  const [viewHistoryOrder, setViewHistoryOrder] = useState<SampleOrder | null>(null);

  // Deleting Entry Modal State
  const [deletingOrder, setDeletingOrder] = useState<{ order: SampleOrder; originalIndex: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Pagination / See More Logs State
  const [visibleLogsCount, setVisibleLogsCount] = useState<number>(15);

  const products = Object.keys(categoryCosts).sort();

  // Load / initialize visible products
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("sample_tracker_visible_products");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((p) => products.includes(p));
          setVisibleProducts(valid);
          return;
        }
      }
    } catch (e) {
      // ignore
    }
    if (products.length > 0) {
      setVisibleProducts(products);
    }
  }, [categoryCosts]);

  const handleToggleProduct = (prod: string) => {
    const list = visibleProducts !== null ? visibleProducts : products;
    let updated: string[];
    if (list.includes(prod)) {
      updated = list.filter((p) => p !== prod);
    } else {
      updated = [...list, prod];
    }
    setVisibleProducts(updated);
    try {
      localStorage.setItem("sample_tracker_visible_products", JSON.stringify(updated));
    } catch (e) {
      // ignore
    }
  };

  const handleShowAll = () => {
    setVisibleProducts(products);
    try {
      localStorage.setItem("sample_tracker_visible_products", JSON.stringify(products));
    } catch (e) {
      // ignore
    }
  };

  const handleHideAll = () => {
    setVisibleProducts([]);
    try {
      localStorage.setItem("sample_tracker_visible_products", JSON.stringify([]));
    } catch (e) {
      // ignore
    }
  };

  // Pick first product as default
  React.useEffect(() => {
    if (products.length > 0 && !selectedProd) {
      setSelectedProd(products[0]);
    }
  }, [categoryCosts]);

  const handleLogOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProd || !purchaseDate || qty <= 0) {
      alert("Please fill in valid order parameters.");
      return;
    }

    try {
      const order: SampleOrder = {
        id: "so_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
        date: purchaseDate,
        product: selectedProd,
        qty: qty,
        loggedBy: currentUserEmail || "Unknown Planner",
        editHistory: [],
      };

      const ref = doc(db, "config", "samples");
      await updateDoc(ref, {
        orders: arrayUnion(order),
      });

      setSuccessMsg(`Logged purchase of ${qty} units of ${selectedProd}!`);
      setQty(1);
      onRefresh();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/samples");
    }
  };

  const handleOpenEditModal = (order: SampleOrder, originalIndex: number) => {
    setEditingOrder(order);
    setEditingOrderIndex(originalIndex);
    setNewQtyInput(order.qty);
    setEditReasonInput("");
  };

  const handleSaveEditQty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || editingOrderIndex === null) return;
    if (newQtyInput <= 0) {
      alert("Please enter a valid quantity greater than 0.");
      return;
    }
    if (!editReasonInput.trim()) {
      alert("Please provide a reason for editing the quantity.");
      return;
    }
    if (newQtyInput === editingOrder.qty) {
      alert("The new quantity is identical to the current quantity.");
      return;
    }

    setIsSavingEdit(true);

    try {
      const historyItem: SampleEditHistory = {
        date: new Date().toISOString(),
        editedBy: currentUserEmail || "Unknown Planner",
        previousQty: editingOrder.qty,
        newQty: newQtyInput,
        reason: editReasonInput.trim(),
      };

      const updatedOrders = [...sampleOrders];

      let targetIdx = editingOrderIndex;
      if (editingOrder.id) {
        const foundIdx = updatedOrders.findIndex((o) => o.id === editingOrder.id);
        if (foundIdx !== -1) targetIdx = foundIdx;
      }

      if (targetIdx >= 0 && targetIdx < updatedOrders.length) {
        const currentObj = updatedOrders[targetIdx];
        updatedOrders[targetIdx] = {
          ...currentObj,
          id: currentObj.id || ("so_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8)),
          qty: newQtyInput,
          editHistory: [...(currentObj.editHistory || []), historyItem],
        };

        const ref = doc(db, "config", "samples");
        await updateDoc(ref, {
          orders: updatedOrders,
        });

        setSuccessMsg(
          `Updated quantity for ${currentObj.product} (${currentObj.date}) from ${currentObj.qty} to ${newQtyInput} units!`
        );
        onRefresh();
        setEditingOrder(null);
        setEditingOrderIndex(null);
        setTimeout(() => setSuccessMsg(""), 3500);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/samples");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingOrder) return;
    setIsDeleting(true);

    try {
      const { order, originalIndex } = deletingOrder;
      const updatedOrders = [...sampleOrders];

      let targetIdx = originalIndex;
      if (order.id) {
        const foundIdx = updatedOrders.findIndex((o) => o.id === order.id);
        if (foundIdx !== -1) targetIdx = foundIdx;
      }

      if (targetIdx >= 0 && targetIdx < updatedOrders.length) {
        const removedItem = updatedOrders[targetIdx];
        updatedOrders.splice(targetIdx, 1);

        const ref = doc(db, "config", "samples");
        await updateDoc(ref, {
          orders: updatedOrders,
        });

        setSuccessMsg(
          `Deleted procurement entry for ${removedItem.product} (${removedItem.date}, ${removedItem.qty} units).`
        );
        onRefresh();
        setDeletingOrder(null);
        setTimeout(() => setSuccessMsg(""), 3500);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/samples");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateTarget = async (prodName: string, val: number) => {
    try {
      const updatedTargets = { ...sampleTargets, [prodName]: val };
      const ref = doc(db, "config", "samples");
      await updateDoc(ref, {
        targets: updatedTargets,
      });
      onRefresh();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "config/samples");
    }
  };

  const getMonthlySumsForProduct = (prodName: string) => {
    const currentYear = new Date().getFullYear();
    const sums = Array(12).fill(0);

    sampleOrders.forEach((o) => {
      if (o.product === prodName) {
        const d = new Date(o.date + "T00:00:00");
        if (d.getFullYear() === currentYear) {
          sums[d.getMonth()] += Number(o.qty) || 0;
        }
      }
    });

    return sums;
  };

  const sortedOrdersWithIndex = sampleOrders
    .map((order, originalIndex) => ({ order, originalIndex }))
    .sort((a, b) => b.order.date.localeCompare(a.order.date));

  const visibleOrders = sortedOrdersWithIndex.slice(0, visibleLogsCount);

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-xl flex items-center">
          <CheckCircle className="text-green-500 mr-3 h-5 w-5 animate-bounce" />
          <p className="text-sm font-semibold text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Logging form controls */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <h3 className="text-md font-bold text-gray-900 uppercase tracking-tight flex items-center mb-4">
          <Package className="mr-2 h-5 w-5 text-blue-600" />
          Log Sample Procurement
        </h3>
        <form onSubmit={handleLogOrder} className="flex flex-wrap items-end gap-4">
          <div className="min-w-44 flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Date Purchased
            </label>
            <input
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="min-w-56 flex-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Product Category
            </label>
            <select
              value={selectedProd}
              onChange={(e) => setSelectedProd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-24 max-w-32 flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Quantity / Vol
            </label>
            <input
              type="number"
              min="1"
              required
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-gray-850"
            />
          </div>

          <button
            type="submit"
            className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-xs transition-all h-[38px] cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Log Order
          </button>
        </form>
      </div>

      {/* Sparkline grids */}
      <div>
        <h4 className="text-sm font-bold text-gray-600 uppercase tracking-widest pl-1 mb-4 flex items-center">
          <Target className="mr-1.5 h-4.5 w-4.5 text-blue-500" />
          Active Product Sparklines ({new Date().getFullYear()})
        </h4>

        {/* Dynamic Display Filtering Controls */}
        <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 mb-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-150 pb-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-655">
                Show/Hide Product Categories
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleShowAll}
                className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                Show All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={handleHideAll}
                className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-slate-750 transition-colors cursor-pointer"
              >
                Hide All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => {
              const isVisible = visibleProducts?.includes(p) ?? true;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleToggleProduct(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all border flex items-center gap-1.5 ${
                    isVisible
                      ? "bg-blue-50 text-blue-700 border-blue-200 shadow-3xs"
                      : "bg-white text-gray-400 border-gray-200 hover:border-gray-200 hover:bg-gray-100 hover:text-gray-600"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isVisible ? "bg-blue-600 animate-pulse" : "bg-gray-300"
                    }`}
                  />
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products
            .filter((prod) => visibleProducts === null || visibleProducts.includes(prod))
            .map((prod) => {
              const target = sampleTargets[prod] || 20;
              const sums = getMonthlySumsForProduct(prod);
              const maxVal = Math.max(target, ...sums, 1);

              const width = 360;
              const height = 120;
              const padding = 15;

              const points = sums
                .map((val, idx) => {
                  const x = padding + (idx * (width - 2 * padding)) / 11;
                  const y = height - padding - (val * (height - 2 * padding)) / maxVal;
                  return `${x},${y}`;
                })
                .join(" ");

              const targetY = height - padding - (target * (height - 2 * padding)) / maxVal;

              const hIdx = hoveredMonths[prod];
              const hasHover = hIdx !== undefined && hIdx !== null;
              const hoveredVal = hasHover ? sums[hIdx] : 0;
              const hoveredX = hasHover ? padding + (hIdx * (width - 2 * padding)) / 11 : 0;
              const hoveredY = hasHover ? height - padding - (hoveredVal * (height - 2 * padding)) / maxVal : 0;

              return (
                <div
                  key={prod}
                  className="bg-white p-5 border border-gray-200 rounded-xl shadow-3xs flex flex-col justify-between relative group"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <span className="font-extrabold text-sm text-gray-900 tracking-tight leading-none italic uppercase">
                      {prod}
                    </span>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-gray-400 font-semibold uppercase font-mono">Target:</span>
                      <input
                        type="number"
                        min="1"
                        value={target}
                        onChange={(e) => handleUpdateTarget(prod, Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-11 text-center bg-gray-50 border border-blue-200 text-blue-700 rounded-md py-0.5 text-xs font-bold font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  <div
                    className="bg-gray-50 rounded-lg p-2 border border-gray-150 relative overflow-visible"
                    onMouseLeave={() => setHoveredMonths((prev) => ({ ...prev, [prod]: null }))}
                  >
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-fit overflow-visible">
                      <line
                        x1={padding}
                        y1={targetY}
                        x2={width - padding}
                        y2={targetY}
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="4,4"
                        opacity={0.7}
                      />

                      <defs>
                        <linearGradient id={`grad-${prod.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      <path
                        d={`M ${padding},${height - padding} L ${points} L ${width - padding},${
                          height - padding
                        } Z`}
                        fill={`url(#grad-${prod.replace(/\s+/g, "")})`}
                      />

                      <polyline fill="none" stroke="#2563eb" strokeWidth={2.5} points={points} />

                      {hasHover && (
                        <line
                          x1={hoveredX}
                          y1={padding}
                          x2={hoveredX}
                          y2={height - padding}
                          stroke="#94a3b8"
                          strokeWidth={1.2}
                          strokeDasharray="3,3"
                          pointerEvents="none"
                        />
                      )}

                      {sums.map((val, idx) => {
                        const x = padding + (idx * (width - 2 * padding)) / 11;
                        const y = height - padding - (val * (height - 2 * padding)) / maxVal;
                        const isOver = val >= target;
                        const isCurrentlyHovered = hIdx === idx;

                        return (
                          <circle
                            key={idx}
                            cx={x}
                            cy={y}
                            r={isCurrentlyHovered ? 5.5 : 3.5}
                            className={`${
                              isOver ? "fill-green-600 stroke-white" : "fill-blue-600 stroke-white"
                            } ${isCurrentlyHovered ? "stroke-2 shadow-md" : "stroke-1"} transition-all duration-150`}
                            style={isCurrentlyHovered ? { filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.15))" } : undefined}
                          />
                        );
                      })}

                      {hasHover && (
                        <circle
                          cx={hoveredX}
                          cy={hoveredY}
                          r={6.5}
                          className={`${
                            hoveredVal >= target
                              ? "fill-green-600 stroke-green-100"
                              : "fill-blue-600 stroke-blue-100"
                          } stroke-2 animate-ping opacity-45`}
                          pointerEvents="none"
                        />
                      )}

                      {sums.map((val, idx) => {
                        const x = padding + (idx * (width - 2 * padding)) / 11;
                        return (
                          <rect
                            key={`hover-${idx}`}
                            x={x - 15}
                            y={0}
                            width={30}
                            height={height}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() =>
                              setHoveredMonths((prev) => ({ ...prev, [prod]: idx }))
                            }
                          />
                        );
                      })}
                    </svg>

                    {hasHover && (
                      <div
                        className="absolute bg-slate-900 border border-slate-800 text-white rounded-lg px-2.5 py-1.5 shadow-xl pointer-events-none z-20 select-none transition-all duration-150 ease-out"
                        style={{
                          left: `${(hoveredX / width) * 100}%`,
                          top: `${(hoveredY / height) * 100}%`,
                          transform: "translate(-50%, -125%)",
                        }}
                      >
                        <div className="text-center min-w-[70px]">
                          <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider font-mono text-center">
                            {MONTHS[hIdx]}
                          </p>
                          <p className="text-xs font-black tracking-tight leading-snug text-center">
                            {hoveredVal}{" "}
                            <span className="text-[9px] font-semibold text-gray-300">units</span>
                          </p>
                          <span
                            className={`text-[8px] font-extrabold uppercase px-1 py-0.2 rounded-xs block mt-0.5 text-center ${
                              hoveredVal >= target
                                ? "bg-green-500/20 text-green-300 border border-green-500/10"
                                : "bg-orange-500/20 text-orange-400 border border-orange-500/10"
                            }`}
                          >
                            {hoveredVal >= target ? "Goal Met" : `${target - hoveredVal} short`}
                          </span>
                        </div>
                        <div className="absolute left-1/2 bottom-0 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 transform -translate-x-1/2 translate-y-1/2 rotate-45" />
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex justify-between text-[10px] text-gray-400 font-mono select-none px-1">
                    <span>{MONTHS[0]}</span>
                    <span>{MONTHS[3]}</span>
                    <span>{MONTHS[6]}</span>
                    <span>{MONTHS[9]}</span>
                    <span>{MONTHS[11]}</span>
                  </div>
                </div>
              );
            })}

          {products.filter((p) => visibleProducts === null || visibleProducts.includes(p)).length === 0 && (
            <div className="col-span-full py-12 text-center bg-gray-50 border border-gray-150 rounded-xl">
              <p className="text-sm font-semibold text-gray-400 italic">
                All product category graphs are currently hidden. Select options above to display.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Sample Procurement History Logs */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h3 className="text-md font-bold text-gray-900 uppercase tracking-tight flex items-center text-slate-800">
            <Calendar className="mr-2 h-5 w-5 text-indigo-600" />
            Procurement Activity Logs
          </h3>
          {sampleOrders.length > 0 && (
            <div className="text-xs font-semibold text-gray-500">
              Total Records: <span className="font-extrabold text-gray-900">{sampleOrders.length}</span>
            </div>
          )}
        </div>

        {sampleOrders.length === 0 ? (
          <p className="text-sm font-semibold text-gray-400 italic py-4 text-center bg-gray-50 border border-gray-150 rounded-xl">
            No procurement orders have been logged yet.
          </p>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left">Date Purchased</th>
                    <th className="px-5 py-3 text-left">Product Category</th>
                    <th className="px-5 py-3 text-center">Procured Volume</th>
                    <th className="px-5 py-3 text-left">Logged By</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 font-medium">
                  {visibleOrders.map(({ order, originalIndex }, idx) => {
                    const hasHistory = order.editHistory && order.editHistory.length > 0;
                    return (
                      <tr key={order.id || idx} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap text-gray-900 font-bold font-mono">
                          {order.date}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-gray-700 italic uppercase text-xs font-bold">
                          {order.product}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-center text-gray-800 font-bold">
                          <div className="inline-flex items-center gap-1.5 justify-center">
                            <span>{order.qty} units</span>
                            {hasHistory && (
                              <button
                                type="button"
                                onClick={() => setViewHistoryOrder(order)}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer transition-colors"
                                title="View quantity edit audit history"
                              >
                                <History className="h-3 w-3 mr-0.5" />
                                Edited ({order.editHistory!.length})
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-left">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 uppercase">
                            {order.loggedBy ? order.loggedBy.split("@")[0] : "System"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(order, originalIndex)}
                              className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
                              title="Edit Quantity"
                            >
                              <Edit3 className="h-3.5 w-3.5 mr-1" />
                              Edit Qty
                            </button>
                            {hasHistory && (
                              <button
                                type="button"
                                onClick={() => setViewHistoryOrder(order)}
                                className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                title="View Full Audit History"
                              >
                                <History className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeletingOrder({ order, originalIndex })}
                              className="inline-flex items-center px-2 py-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                              title="Delete Sample Entry"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls / See More Button */}
            <div className="mt-4 pt-3 border-t border-gray-150 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-semibold">
              <div>
                Showing <span className="font-extrabold text-gray-900">{visibleOrders.length}</span> of{" "}
                <span className="font-extrabold text-gray-900">{sortedOrdersWithIndex.length}</span> procurement logs
              </div>

              <div className="flex items-center gap-2">
                {visibleLogsCount < sortedOrdersWithIndex.length && (
                  <>
                    <button
                      type="button"
                      onClick={() => setVisibleLogsCount((prev) => prev + 15)}
                      className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <ChevronDown className="h-4 w-4" />
                      See More Logs (+15)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleLogsCount(sortedOrdersWithIndex.length)}
                      className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      Show All ({sortedOrdersWithIndex.length})
                    </button>
                  </>
                )}

                {visibleLogsCount > 15 && (
                  <button
                    type="button"
                    onClick={() => setVisibleLogsCount(15)}
                    className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <ChevronUp className="h-4 w-4" />
                    Show Less
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Quantity Modal */}
      <AnimatePresence>
        {editingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingOrder(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.35 }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-150 max-w-lg w-full overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-indigo-600 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit3 className="h-5 w-5 text-indigo-200" />
                  <h2 className="text-base font-extrabold uppercase tracking-tight">
                    Edit Logged Quantity
                  </h2>
                </div>
                <button
                  onClick={() => setEditingOrder(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSaveEditQty} className="p-6 space-y-5 overflow-y-auto text-xs font-semibold text-gray-700">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[10px] text-gray-400 font-bold uppercase">Product Category</span>
                    <span className="font-extrabold text-gray-900 uppercase text-xs">{editingOrder.product}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-400 font-bold uppercase">Date Purchased</span>
                    <span className="font-bold text-gray-800 font-mono text-xs">{editingOrder.date}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Current Quantity
                    </label>
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 font-bold text-gray-500 font-mono">
                      {editingOrder.qty} units
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      New Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newQtyInput}
                      onChange={(e) => setNewQtyInput(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Reason for Editing <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Typo in original entry, vendor receipt mismatch..."
                    value={editReasonInput}
                    onChange={(e) => setEditReasonInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-800"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 italic">
                    * A reason is required to maintain full audit traceability.
                  </p>
                </div>

                {editingOrder.editHistory && editingOrder.editHistory.length > 0 && (
                  <div className="border-t border-gray-150 pt-3 mt-2">
                    <h4 className="text-[11px] font-extrabold uppercase text-gray-500 tracking-wider flex items-center mb-2.5">
                      <History className="h-3.5 w-3.5 mr-1 text-indigo-500" />
                      Previous Edit Audit Trail ({editingOrder.editHistory.length})
                    </h4>
                    <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                      {editingOrder.editHistory.map((item, idx) => (
                        <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-[11px]">
                          <div className="flex items-center justify-between text-gray-500 text-[10px] font-mono mb-1">
                            <span>{new Date(item.date).toLocaleString()}</span>
                            <span className="font-bold text-indigo-600">{item.editedBy.split("@")[0]}</span>
                          </div>
                          <div className="font-bold text-gray-800 flex items-center gap-1.5 mb-0.5">
                            <span className="line-through text-gray-400">{item.previousQty} units</span>
                            <span>→</span>
                            <span className="text-blue-700">{item.newQty} units</span>
                          </div>
                          <div className="text-gray-600 italic text-[10px] bg-white p-1.5 rounded border border-gray-150">
                            "{item.reason}"
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit || !editReasonInput.trim() || newQtyInput <= 0 || newQtyInput === editingOrder.qty}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingEdit ? "Saving..." : "Save Quantity Change"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audit History Viewer Modal */}
      <AnimatePresence>
        {viewHistoryOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewHistoryOrder(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-150 max-w-md w-full overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="bg-slate-800 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-indigo-300" />
                  <h2 className="text-base font-extrabold uppercase tracking-tight">
                    Quantity Edit Audit Log
                  </h2>
                </div>
                <button
                  onClick={() => setViewHistoryOrder(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                  <p className="font-extrabold text-slate-900 uppercase">{viewHistoryOrder.product}</p>
                  <p className="text-slate-500 font-mono text-[11px]">
                    Purchased: {viewHistoryOrder.date} | Current Qty: {viewHistoryOrder.qty} units
                  </p>
                </div>

                {!viewHistoryOrder.editHistory || viewHistoryOrder.editHistory.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-6">
                    No quantity edits recorded for this entry.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {viewHistoryOrder.editHistory.map((item, idx) => (
                      <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs">
                        <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono mb-1">
                          <span>{new Date(item.date).toLocaleString()}</span>
                          <span className="font-bold text-indigo-600">{item.editedBy.split("@")[0]}</span>
                        </div>
                        <div className="font-bold text-gray-800 flex items-center gap-2 mb-1">
                          <span className="line-through text-gray-400">{item.previousQty} units</span>
                          <span>→</span>
                          <span className="text-indigo-700 font-extrabold">{item.newQty} units</span>
                        </div>
                        <div className="text-gray-700 italic text-[11px] bg-white p-2 rounded-lg border border-gray-150">
                          "{item.reason}"
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 border-t border-gray-100 px-6 py-3 flex justify-end">
                <button
                  onClick={() => setViewHistoryOrder(null)}
                  className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Entry Confirmation Modal */}
      <AnimatePresence>
        {deletingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setDeletingOrder(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.35 }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-150 max-w-md w-full overflow-hidden relative z-10 flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-red-600 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-100 animate-bounce" />
                  <h2 className="text-base font-extrabold uppercase tracking-tight">
                    Confirm Entry Deletion
                  </h2>
                </div>
                <button
                  onClick={() => !isDeleting && setDeletingOrder(null)}
                  disabled={isDeleting}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 text-xs font-semibold text-gray-700">
                <p className="text-gray-600 text-xs">
                  Are you sure you want to delete this sample procurement log entry? This action cannot be undone.
                </p>

                <div className="bg-red-50/50 border border-red-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between items-center border-b border-red-100 pb-2">
                    <span className="text-gray-500 uppercase text-[10px] font-bold">Product Category</span>
                    <span className="font-extrabold text-red-950 uppercase">{deletingOrder.order.product}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-red-100 pb-2">
                    <span className="text-gray-500 uppercase text-[10px] font-bold">Date Purchased</span>
                    <span className="font-bold text-gray-900 font-mono">{deletingOrder.order.date}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-red-100 pb-2">
                    <span className="text-gray-500 uppercase text-[10px] font-bold">Procured Quantity</span>
                    <span className="font-extrabold text-red-700 font-mono">{deletingOrder.order.qty} units</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 uppercase text-[10px] font-bold">Logged By</span>
                    <span className="font-bold text-gray-700 uppercase">
                      {deletingOrder.order.loggedBy ? deletingOrder.order.loggedBy.split("@")[0] : "System"}
                    </span>
                  </div>
                </div>

                {deletingOrder.order.editHistory && deletingOrder.order.editHistory.length > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                    Note: This entry has {deletingOrder.order.editHistory.length} recorded quantity edit audit log(s) which will also be removed.
                  </p>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 border-t border-gray-100 px-6 py-3.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingOrder(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? "Deleting..." : "Delete Entry"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
