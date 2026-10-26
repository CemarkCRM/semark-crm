import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import Login from "@/components/Login";
import { CurrentUserContext, useAuthProvider, useCurrentUser } from "@/lib/currentUser";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Tasks from "@/pages/Tasks";
import Service from "@/pages/Service";
import Rentals from "@/pages/Rentals";
import Equipment from "@/pages/Equipment";
import Settings from "@/pages/Settings";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={Leads} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/service" component={Service} />
        <Route path="/rentals" component={Rentals} />
        <Route path="/equipment" component={Equipment} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthedApp() {
  const { currentUser } = useCurrentUser();
  if (!currentUser) return <Login />;
  return (
    <Router hook={useHashLocation}>
      <AppRouter />
    </Router>
  );
}

function App() {
  const auth = useAuthProvider();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <CurrentUserContext.Provider value={auth}>
          <AuthedApp />
        </CurrentUserContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
