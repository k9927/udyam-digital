import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { PublicLayout, CustomerLayout, StaffLayout, RequireRole, RoleSwitcher } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Landing from './pages/public/Landing.jsx';
// Every page except the landing page loads on demand, so a customer never downloads the staff screens or charts.
const Advisor = lazy(() => import('./pages/public/Advisor.jsx'));
const Quote = lazy(() => import('./pages/public/Quote.jsx'));
const Login = lazy(() => import('./pages/public/Login.jsx'));
const StaffLogin = lazy(() => import('./pages/public/StaffLogin.jsx'));
const Track = lazy(() => import('./pages/public/Track.jsx'));
const Privacy = lazy(() => import('./pages/public/Privacy.jsx'));
const WhatsApp = lazy(() => import('./pages/public/WhatsApp.jsx'));
const NotFound = lazy(() => import('./pages/public/NotFound.jsx'));
const Dashboard = lazy(() => import('./pages/customer/Dashboard.jsx'));
const Kyc = lazy(() => import('./pages/customer/Kyc.jsx'));
const UdyamGuide = lazy(() => import('./pages/customer/UdyamGuide.jsx'));
const OrderDetail = lazy(() => import('./pages/customer/OrderDetail.jsx'));
const Services = lazy(() => import('./pages/customer/Services.jsx'));
const Bills = lazy(() => import('./pages/customer/Bills.jsx'));
const Help = lazy(() => import('./pages/customer/Help.jsx'));
const Messages = lazy(() => import('./pages/customer/Messages.jsx'));
const MyData = lazy(() => import('./pages/customer/MyData.jsx'));
const PartnerQueue = lazy(() => import('./pages/partner/PartnerQueue.jsx'));
const PartnerCase = lazy(() => import('./pages/partner/PartnerCase.jsx'));
const PartnerLeads = lazy(() => import('./pages/partner/PartnerLeads.jsx'));
const PartnerActivations = lazy(() => import('./pages/partner/PartnerActivations.jsx'));
const FieldJobs = lazy(() => import('./pages/field/FieldJobs.jsx'));
const FieldJob = lazy(() => import('./pages/field/FieldJob.jsx'));
const ReviewQueue = lazy(() => import('./pages/review/ReviewQueue.jsx'));
const ReviewDetail = lazy(() => import('./pages/review/ReviewDetail.jsx'));
const OpsDashboard = lazy(() => import('./pages/ops/OpsDashboard.jsx'));
const OpsOrders = lazy(() => import('./pages/ops/OpsOrders.jsx'));
const OpsOrderDetail = lazy(() => import('./pages/ops/OpsOrderDetail.jsx'));
const OpsPacking = lazy(() => import('./pages/ops/OpsPacking.jsx'));
const OpsCases = lazy(() => import('./pages/ops/OpsCases.jsx'));
const OpsTickets = lazy(() => import('./pages/ops/OpsTickets.jsx'));
const OpsUsers = lazy(() => import('./pages/ops/OpsUsers.jsx'));
const OpsCatalogue = lazy(() => import('./pages/ops/OpsCatalogue.jsx'));
const OpsAudit = lazy(() => import('./pages/ops/OpsAudit.jsx'));

const STAFF = ['partner', 'delivery', 'technician', 'kyc_officer', 'ops_admin', 'super_admin'];
const staff = (roles, element) => <RequireRole roles={roles}>{element}</RequireRole>;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Spinner /></div>}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="advisor" element={<Advisor />} />
          <Route path="quote/:id" element={<Quote />} />
          <Route path="login" element={<Login />} />
          <Route path="track" element={<Track />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="whatsapp" element={<WhatsApp />} />
        </Route>
        <Route path="staff/login" element={<StaffLogin />} />
        <Route path="app" element={<RequireRole roles={['customer']}><CustomerLayout /></RequireRole>}>
          <Route index element={<Dashboard />} />
          <Route path="kyc" element={<Kyc />} />
          <Route path="udyam" element={<UdyamGuide />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="services" element={<Services />} />
          <Route path="bills" element={<Bills />} />
          <Route path="help" element={<Help />} />
          <Route path="messages" element={<Messages />} />
          <Route path="data" element={<MyData />} />
        </Route>
        <Route element={<RequireRole roles={STAFF}><StaffLayout /></RequireRole>}>
          <Route path="inbox" element={<Messages staff />} />
          <Route path="partner" element={staff(['partner', 'ops_admin'], <PartnerQueue />)} />
          <Route path="partner/cases/:id" element={staff(['partner', 'ops_admin'], <PartnerCase />)} />
          <Route path="partner/leads" element={staff(['partner', 'ops_admin'], <PartnerLeads />)} />
          <Route path="partner/activations" element={staff(['partner', 'ops_admin'], <PartnerActivations />)} />
          <Route path="field" element={staff(['delivery', 'technician', 'ops_admin'], <FieldJobs />)} />
          <Route path="field/jobs/:id" element={staff(['delivery', 'technician', 'ops_admin'], <FieldJob />)} />
          <Route path="review" element={staff(['kyc_officer', 'ops_admin'], <ReviewQueue />)} />
          <Route path="review/:id" element={staff(['kyc_officer', 'ops_admin'], <ReviewDetail />)} />
          <Route path="ops" element={staff(['ops_admin'], <OpsDashboard />)} />
          <Route path="ops/orders" element={staff(['ops_admin'], <OpsOrders />)} />
          <Route path="ops/orders/:id" element={staff(['ops_admin'], <OpsOrderDetail />)} />
          <Route path="ops/packing" element={staff(['ops_admin'], <OpsPacking />)} />
          <Route path="ops/cases" element={staff(['ops_admin'], <OpsCases />)} />
          <Route path="ops/tickets" element={staff(['ops_admin'], <OpsTickets />)} />
          <Route path="ops/users" element={staff(['ops_admin'], <OpsUsers />)} />
          <Route path="ops/catalogue" element={staff(['ops_admin'], <OpsCatalogue />)} />
          <Route path="ops/audit" element={staff(['ops_admin'], <OpsAudit />)} />
        </Route>
        <Route path="*" element={<PublicLayout />}><Route path="*" element={<NotFound />} /></Route>
      </Routes>
      </Suspense>
      <RoleSwitcher />
    </>
  );
}
