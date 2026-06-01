/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { SampleOrder } from "../types";
import { doc, updateDoc, arrayUnion, db, handleFirestoreError, OperationType } from "../firebase";
import { Calendar, Package, Plus, Target, CheckCircle } from "lucide-react";

interface SamplesProps {
  categoryCosts: Record<string, Record<string, number>>;
  sampleOrders: SampleOrder[];
  sampleTargets: Record<string, number>;
  onRefresh: () => void;
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
}: SamplesProps) {
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedProd, setSelectedProd] = useState("");
  const [qty, setQty] = useState(1);
  const [successMsg, setSuccessMsg] = useState("");

  const products = Object.keys(categoryCosts).sort();

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((prod) => {
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

            return (
              <div
                key={prod}
                className="bg-white p-5 border border-gray-200 rounded-xl shadow-3xs flex flex-col justify-between"
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
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-150">
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-fit">
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

                    {/* Points markers */}
                    {sums.map((val, idx) => {
                      const x = padding + (idx * (width - 2 * padding)) / 11;
                      const y = height - padding - (val * (height - 2 * padding)) / maxVal;
                      const isOver = val >= target;

                      return (
                        <circle
                          key={idx}
                          cx={x}
                          cy={y}
                          r={3.5}
                          className={`${
                            isOver ? "fill-green-600 stroke-white" : "fill-blue-600 stroke-white"
                          } stroke-1`}
                          title={`Month: ${MONTHS[idx]}, Sum: ${val}`}
                        />
                      );
                    })}
                  </svg>
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
        </div>
      </div>
    </div>
  );
}
