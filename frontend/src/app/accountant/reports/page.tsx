"use client";
import { FileBarChart, Users, Receipt, AlertTriangle, Calendar, BookOpen } from "lucide-react";

const reports = [
  { title: "Daily Cash Book", description: "Today's collections summary for principal's signature", icon: Calendar, href: "/accountant/reports/daily-cashbook", ready: false },
  { title: "Fee Defaulter Report", description: "Students with overdue fees by grade/section", icon: AlertTriangle, href: "/accountant/reports/defaulters", ready: false },
  { title: "Fee Discount Report", description: "All scholarships and discounts applied", icon: BookOpen, href: "/accountant/reports/discounts", ready: false },
  { title: "Payment History", description: "Search by receipt number, student, or date range", icon: Receipt, href: "/accountant/reports/payment-history", ready: false },
  { title: "Monthly Summary", description: "Total collected vs expected, by fee category", icon: FileBarChart, href: "/accountant/reports/monthly-summary", ready: false },
  { title: "Student Count", description: "Grade-wise enrollment count for government reporting", icon: Users, href: "/accountant/reports/student-count", ready: false },
];

export default function AccountantReportsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Financial and administrative reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((report) => (
          <div
            key={report.title}
            className={`card p-5 transition-all ${report.ready ? "hover:shadow-md cursor-pointer" : "opacity-60"}`}
            onClick={() => {
              if (report.ready) window.location.href = report.href;
            }}
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <report.icon size={22} className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-primary">{report.title}</h3>
                  {!report.ready && (
                    <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-medium">Coming Soon</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{report.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}