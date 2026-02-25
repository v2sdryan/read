import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Package, Contact, Glasses, FileText, Receipt, BarChart3 } from 'lucide-react';
import Dashboard from '@/components/templates/Dashboard';
import { formatCurrency, getBranchName, BRANCHES } from '@/lib/utils';
import { useBranch } from '@/contexts/BranchContext';

const categories = [
  { key: 'revenue', label: '生意總額', icon: DollarSign },
  { key: 'performance', label: '業績總計', icon: TrendingUp },
  { key: 'glasses_purchase', label: '眼鏡入貨總額', icon: Package },
  { key: 'contact_lens', label: '隱形/藥水', icon: Contact },
  { key: 'glasses_sales', label: '眼鏡銷售總額', icon: Glasses },
  { key: 'misc', label: '什項', icon: FileText },
  { key: 'lens', label: '鏡片', icon: Receipt },
  { key: 'total_sales', label: '銷售總額', icon: BarChart3 },
];

const REPORT_TYPES = categories.map((c) => c.key);

const ReportsPage = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [reportData, setReportData] = useState({});
  const [loading, setLoading] = useState(false);
  const { selectedBranch } = useBranch();

  // Map selectedBranch id to branch code for the API
  const branchCode = selectedBranch ? (BRANCHES.find((b) => b.id === selectedBranch)?.code || '') : '';

  const fetchReports = useCallback(async (m, branch) => {
    setLoading(true);
    try {
      const results = {};
      const fetches = REPORT_TYPES.map(async (type) => {
        const params = new URLSearchParams({ type, month: m });
        if (branch) params.set('branch', branch);
        const res = await fetch(`/api/report?${params}`);
        if (res.ok) {
          const json = await res.json();
          results[type] = json.data || [];
        } else {
          results[type] = [];
        }
      });
      await Promise.all(fetches);
      setReportData(results);
    } catch {
      setReportData({});
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when month or branch changes
  useEffect(() => {
    fetchReports(month, branchCode);
  }, [month, branchCode, fetchReports]);

  const handleMonthChange = useCallback((m) => {
    setMonth(m);
  }, []);

  // Compute summary cards from fetched data
  const revenueRows = reportData.revenue || [];
  const perfRows = reportData.performance || [];
  const totalRevenue = revenueRows.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
  const totalSalesCount = perfRows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  const totalSalesAmt = (reportData.total_sales || []).reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const glassTotal = (reportData.glasses_purchase || []).reduce((sum, r) => sum + (Number(r.total) || 0), 0);

  const summaryCards = [
    { label: '本月營業額', value: totalRevenue, type: 'currency' },
    { label: '銷售筆數', value: totalSalesCount },
    { label: '銷售總額', value: totalSalesAmt, type: 'currency' },
    { label: '眼鏡入貨', value: glassTotal, type: 'currency' },
  ];

  const renderContent = (category) => {
    const rows = reportData[category] || [];

    switch (category) {
      case 'revenue': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">各分店生意總額</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-light">分店</th>
                  <th className="text-right py-2 font-medium text-text-light">筆數</th>
                  <th className="text-right py-2 font-medium text-text-light">現金</th>
                  <th className="text-right py-2 font-medium text-text-light">EPS</th>
                  <th className="text-right py-2 font-medium text-text-light">信用咭</th>
                  <th className="text-right py-2 font-medium text-text-light">生意額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.branch} className="border-b border-border/50">
                    <td className="py-3 font-medium">{getBranchName(row.branch)}</td>
                    <td className="py-3 text-right">{row.count}</td>
                    <td className="py-3 text-right">{formatCurrency(row.cash)}</td>
                    <td className="py-3 text-right">{formatCurrency(row.eps)}</td>
                    <td className="py-3 text-right">{formatCurrency(row.credit_card)}</td>
                    <td className="py-3 text-right font-semibold text-primary">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-text-light">本月無資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case 'performance': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">業績排名</h3>
            <div className="space-y-3">
              {rows.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                  <span className="flex-1 font-medium">{item.name}</span>
                  <span className="text-sm text-text-light">{item.count} 筆</span>
                  <span className="font-semibold text-primary">{formatCurrency(item.total)}</span>
                </div>
              ))}
              {rows.length === 0 && <p className="text-text-light text-center py-8">本月無資料</p>}
            </div>
          </div>
        );
      }
      case 'glasses_purchase': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">眼鏡入貨總額（按供應商）</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-light">供應商</th>
                  <th className="text-right py-2 font-medium text-text-light">數量</th>
                  <th className="text-right py-2 font-medium text-text-light">金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-border/50">
                    <td className="py-2">{row.name}</td>
                    <td className="py-2 text-right">{row.qty}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-8 text-text-light">本月無資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case 'contact_lens': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">隱形眼鏡/藥水（按供應商）</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-light">公司名稱</th>
                  <th className="text-center py-2 font-medium text-text-light">C/S</th>
                  <th className="text-right py-2 font-medium text-text-light">數量</th>
                  <th className="text-right py-2 font-medium text-text-light">總計</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.name}-${row.type}-${i}`} className="border-b border-border/50">
                    <td className="py-2">{row.name}</td>
                    <td className="py-2 text-center">{row.type || '-'}</td>
                    <td className="py-2 text-right">{row.qty}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-text-light">本月無資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case 'misc': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">什項支出</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-light">日期</th>
                  <th className="text-left py-2 font-medium text-text-light">分店</th>
                  <th className="text-left py-2 font-medium text-text-light">代號</th>
                  <th className="text-right py-2 font-medium text-text-light">金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2">{d.record_date}</td>
                    <td className="py-2">{getBranchName(d.comp)}</td>
                    <td className="py-2">{d.misc_code || '-'}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(d.misc)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-text-light">本月無什項支出</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case 'glasses_sales': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">眼鏡銷售總額（按員工）</h3>
            <div className="space-y-3">
              {rows.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                  <span className="flex-1 font-medium">{item.name}</span>
                  <span className="text-sm text-text-light">{item.count} 筆</span>
                  <span className="font-semibold text-primary">{formatCurrency(item.total)}</span>
                </div>
              ))}
              {rows.length === 0 && <p className="text-text-light text-center py-8">本月無資料</p>}
            </div>
          </div>
        );
      }
      case 'lens': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">鏡片銷售（按員工）</h3>
            <div className="space-y-3">
              {rows.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                  <span className="flex-1 font-medium">{item.name}</span>
                  <span className="text-sm text-text-light">{item.count} 筆</span>
                  <span className="font-semibold text-primary">{formatCurrency(item.total)}</span>
                </div>
              ))}
              {rows.length === 0 && <p className="text-text-light text-center py-8">本月無資料</p>}
            </div>
          </div>
        );
      }
      case 'total_sales': {
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">各分店銷售總額</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-light">分店</th>
                  <th className="text-right py-2 font-medium text-text-light">筆數</th>
                  <th className="text-right py-2 font-medium text-text-light">鏡架</th>
                  <th className="text-right py-2 font-medium text-text-light">鏡片</th>
                  <th className="text-right py-2 font-medium text-text-light">總計</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.branch} className="border-b border-border/50">
                    <td className="py-3 font-medium">{getBranchName(row.branch)}</td>
                    <td className="py-3 text-right">{row.count}</td>
                    <td className="py-3 text-right">{formatCurrency(row.frame)}</td>
                    <td className="py-3 text-right">{formatCurrency(row.glass)}</td>
                    <td className="py-3 text-right font-semibold text-primary">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-text-light">本月無資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <div className="text-center text-text-light py-12">報表開發中</div>;
    }
  };

  return (
    <Dashboard
      title="排行榜 (frm排行榜)"
      categories={categories}
      data={[]}
      summaryCards={summaryCards}
      renderContent={renderContent}
      loading={loading}
      onMonthChange={handleMonthChange}
    />
  );
};

export default ReportsPage;
