import { useState, useMemo } from 'react';
import { cn, formatCurrency, BRANCHES } from '@/lib/utils';
import { useBranch } from '@/contexts/BranchContext';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Template B — Dashboard
 * Month selector + category buttons + summary cards.
 *
 * Usage:
 *   <Dashboard
 *     title="排行榜"
 *     categories={[
 *       { key: 'revenue', label: '生意總額', icon: DollarSign },
 *       { key: 'glasses', label: '眼鏡銷售', icon: Glasses },
 *     ]}
 *     data={reportData}
 *     renderContent={(category, data, month) => <div>...</div>}
 *     summaryCards={[
 *       { label: '本月營業額', value: 125000, type: 'currency' },
 *       ...
 *     ]}
 *   />
 */
const Dashboard = ({
  title,
  categories = [],
  data = [],
  renderContent,
  summaryCards = [],
  loading = false,
  onMonthChange,
}) => {
  const currentMonth = new Date().toISOString().slice(0, 7); // '2026-02'
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.key || '');
  const { filterByBranch } = useBranch();

  // Generate month options (last 12 months)
  const months = useMemo(() => {
    const result = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      result.push({
        value: `${y}-${String(m).padStart(2, '0')}`,
        label: `${y}年${m}月`,
      });
      d.setMonth(d.getMonth() - 1);
    }
    return result;
  }, []);

  const filteredData = filterByBranch(data);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-primary">{title}</h2>
        <select
          value={selectedMonth}
          onChange={(e) => { setSelectedMonth(e.target.value); onMonthChange?.(e.target.value); }}
          className="px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      {summaryCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {summaryCards.map((card, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm border border-border p-4">
              <p className="text-xs text-text-light mb-1">{card.label}</p>
              <p className="text-xl font-bold text-text">
                {card.type === 'currency' ? formatCurrency(card.value) : card.value?.toLocaleString() ?? '-'}
              </p>
              {card.change != null && (
                <div className={cn('flex items-center gap-1 text-xs mt-1', card.change > 0 ? 'text-green-600' : card.change < 0 ? 'text-red-500' : 'text-text-light')}>
                  {card.change > 0 ? <TrendingUp className="w-3 h-3" /> : card.change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {card.change > 0 ? '+' : ''}{card.change}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category Tabs */}
      {categories.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                selectedCategory === cat.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white border border-border text-text hover:bg-gray-50'
              )}
            >
              {cat.icon && <cat.icon className="w-4 h-4" />}
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-border p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : renderContent ? (
          renderContent(selectedCategory, filteredData, selectedMonth)
        ) : (
          <div className="text-center text-text-light py-12">選擇類別查看報表</div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
