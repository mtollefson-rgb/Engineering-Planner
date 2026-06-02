/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SampleOrder } from "../types";
import { doc, updateDoc, arrayUnion, db, handleFirestoreError, OperationType } from "../firebase";
import { Calendar, Package, Plus, Target, CheckCircle, Eye } from "lucide-react";

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
      const order = {
        date: purchaseDate,
        product: selectedProd,
        qty: qty,
        loggedBy: currentUserEmail || "Unknown Planner",
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

            // Compute SVG path parameters dynamically (stunning simple sparklines!)
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

                {/* Sparkling vector plot */}
                <div 
                  className="bg-gray-50 rounded-lg p-2 border border-gray-150 relative overflow-visible"
                  onMouseLeave={() => setHoveredMonths((prev) => ({ ...prev, [prod]: null }))}
                >
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-fit overflow-visible">
                    {/* Horizontal target guide */}
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

                    {/* Gradient area */}
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

                    {/* Dynamic line */}
                    <polyline fill="none" stroke="#2563eb" strokeWidth={2.5} points={points} />

                    {/* Vertical hover guide */}
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

                    {/* Points markers */}
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

                    {/* Highlighted active pulses on top of everything */}
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

                    {/* Invisible vertical hover tracking rects for hit-boxes */}
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

                  {/* Absolute positioning Custom Tooltip */}
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
                      {/* Little triangle arrow at bottom */}
                      <div className="absolute left-1/2 bottom-0 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 transform -translate-x-1/2 translate-y-1/2 rotate-45" />
                    </div>
                  )}
                </div>

                {/* Abbreviated horizontal labels */}
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
        <h3 className="text-md font-bold text-gray-900 uppercase tracking-tight flex items-center mb-4 text-slate-800">
          <Calendar className="mr-2 h-5 w-5 text-indigo-600" />
          Recent Procurement Activity Logs
        </h3>
        
        {sampleOrders.length === 0 ? (
          <p className="text-sm font-semibold text-gray-400 italic py-4 text-center bg-gray-50 border border-gray-150 rounded-xl">
            No procurement orders have been logged yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">Date Purchased</th>
                  <th className="px-6 py-3 text-left">Product Category</th>
                  <th className="px-6 py-3 text-center">Procured Volume</th>
                  <th className="px-6 py-3 text-right">Logged By</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 font-medium">
                {[...sampleOrders]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 15) // show up to 15 recent orders
                  .map((order, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-bold font-mono">
                        {order.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 italic uppercase text-xs font-bold">
                        {order.product}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-gray-800 font-bold">
                        {order.qty} units
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 uppercase">
                          {order.loggedBy ? order.loggedBy.split("@")[0] : "System"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {sampleOrders.length > 15 && (
              <p className="text-center text-xs text-gray-400 font-semibold mt-3">
                Showing 15 most recent procurement logs.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
