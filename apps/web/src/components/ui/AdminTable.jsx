// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminTable — responsive Bootstrap table with optional empty state.
 *
 * @param {string[]}     columns     - Column headers
 * @param {ReactNode[][]}rows        - 2D array of cell content, or array of <tr> elements
 * @param {ReactNode}    [empty]     - Content shown when rows is empty
 * @param {boolean}      [hover=true]
 * @param {boolean}      [sm=true]   - table-sm
 * @param {string}       [className]
 */
export default function AdminTable({ columns, rows = [], empty, hover = true, sm = true, className = '' }) {
  const tableClass = ['table', hover && 'table-hover', sm && 'table-sm', 'mb-0', className]
    .filter(Boolean).join(' ');

  return (
    <div className="table-responsive">
      <table className={tableClass}>
        {columns && (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6c757d' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns?.length || 1} className="text-center text-muted py-4">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) =>
              Array.isArray(row) ? (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j}>{cell}</td>)}
                </tr>
              ) : row
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
