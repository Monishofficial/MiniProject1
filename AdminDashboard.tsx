import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Settings } from "lucide-react";
import DepartmentsTab from "@/components/admin/DepartmentsTab";
import SubjectsTab from "@/components/admin/SubjectsTab";
import RoomsTab from "@/components/admin/RoomsTab";
import ExamsTab from "@/components/admin/ExamsTab";
import StudentsTab from "@/components/admin/StudentsTab";
import SeatingTab from "@/components/admin/SeatingTab";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/database')}>
              View Database
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="exams" className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-8">
            <TabsTrigger value="exams">Exams</TabsTrigger>
            <TabsTrigger value="seating">Seating</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
          </TabsList>

          <TabsContent value="exams">
            <ExamsTab />
          </TabsContent>

          <TabsContent value="seating">
            <SeatingTab />
          </TabsContent>

          <TabsContent value="students">
            <StudentsTab />
          </TabsContent>

          <TabsContent value="subjects">
            <SubjectsTab />
          </TabsContent>

          <TabsContent value="rooms">
            <RoomsTab />
          </TabsContent>

          <TabsContent value="departments">
            <DepartmentsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;