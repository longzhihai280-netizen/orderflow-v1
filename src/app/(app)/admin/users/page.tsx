import { UserManagement } from "@/components/user-management";

export default function UsersPage() {
  return <div className="wide-page"><div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Employee Accounts</h1><p className="muted">Create accounts, assign roles and disable access.</p></div></div><UserManagement /></div>;
}
