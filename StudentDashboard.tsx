import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LogOut, Calendar, MapPin, Clock, User, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ExamSchedule {
  id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  subject: {
    name: string;
    code: string;
  };
  room: {
    room_number: string;
    building: string;
  } | null;
  seating: {
    seat_number: string;
    row_number: number;
    column_number: number;
  } | null;
  seatingMap?: Array<{
    id: string;
    seat_number: string;
    row_number: number;
    column_number: number;
    student_id?: string | null;
  }>;
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchData();
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    setIsAdmin(!!data);
  };

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(profileData);

      // Fetch exams with enrollments
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select(`
          subject_id,
          subjects (
            id,
            name,
            code
          )
        `)
        .eq("student_id", user.id);

      if (!enrollments) return;

      const subjectIds = enrollments.map((e: any) => e.subject_id);

      // Fetch exams for enrolled subjects
      const { data: examsData } = await supabase
        .from("exams")
        .select(`
          id,
          exam_date,
          start_time,
          end_time,
          subject_id,
          subjects (
            name,
            code
          ),
          rooms (
            room_number,
            building
          )
        `)
        .in("subject_id", subjectIds)
        .order("exam_date", { ascending: true });

      if (!examsData) return;

      // Fetch seating arrangements for these exams (all seats in the exam rooms)
      const examIds = examsData.map((e: any) => e.id);
      const { data: seatingData } = await supabase
        .from("seating_arrangements")
        .select("*")
        .in("exam_id", examIds);

      // Prepare a map of student enrollments to attach per-seat subject info
      const allStudentIds = Array.from(new Set((seatingData || []).map((s: any) => s.student_id))).filter(Boolean);
      let enrollmentsByStudent: Map<string, any[]> = new Map();
      if (allStudentIds.length > 0) {
        const { data: allEnrollments } = await supabase
          .from('student_enrollments')
          .select('student_id, subject_id, subjects(name, code)')
          .in('student_id', allStudentIds as string[]);
        for (const e of allEnrollments || []) {
          if (!enrollmentsByStudent.has((e as any).student_id)) enrollmentsByStudent.set((e as any).student_id, []);
          enrollmentsByStudent.get((e as any).student_id)!.push(e);
        }
      }

      const examsWithSeating = examsData.map((exam: any) => ({
        ...exam,
        subject: exam.subjects,
        room: exam.rooms,
        // user's own seating (if any)
        seating: seatingData?.find((s: any) => s.exam_id === exam.id && s.student_id === user.id) || null,
        // full seating map for display (used to render seat grid where only user's seat is enabled)
        seatingMap: (seatingData?.filter((s: any) => s.exam_id === exam.id) || []).map((seat: any) => {
          // pick student's subject enrollment; prefer one that matches exam.subject_id
          const choices = enrollmentsByStudent.get(seat.student_id) || [];
          let chosen = null;
          if (choices.length === 1) chosen = choices[0];
          else if (choices.length > 1) {
            chosen = choices.find((c) => (c as any).subject_id === exam.subject_id) || choices[0];
          }
          return {
            ...seat,
            subjects: chosen ? { name: (chosen as any).subjects?.name, code: (chosen as any).subjects?.code } : exam.subjects,
          };
        }),
      }));

      setExams(examsWithSeating);
      // Fallback: for any exam where seating wasn't found, try fetching the student's seating directly
      const missingSeatPromises = examsWithSeating.map(async (exam: any) => {
        if (exam.seating) return null;
        const { data: mySeat } = await supabase
          .from('seating_arrangements')
          .select('*')
          .eq('exam_id', exam.id)
          .eq('student_id', user.id)
          .maybeSingle();
        return mySeat ? { examId: exam.id, seat: mySeat } : null;
      });

      const missingSeats = (await Promise.all(missingSeatPromises)).filter(Boolean) as any[];
      if (missingSeats.length > 0) {
        const updated = examsWithSeating.map((exam: any) => {
          const found = missingSeats.find((m) => m?.examId === exam.id);
          if (found) {
            return { ...exam, seating: found.seat, seatingMap: exam.seatingMap || [found.seat] };
          }
          return exam;
        });
        setExams(updated);
      }
    } catch (error: any) {
      toast.error("Error loading data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    const examDate = new Date(dateStr);
    return examDate.toDateString() === today.toDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Exam Schedule</h1>
            <p className="text-sm text-muted-foreground">Welcome, {profile?.full_name}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => navigate("/admin")}>
                <Settings className="mr-2 h-4 w-4" />
                Admin Panel
              </Button>
            )}
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Student Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Student ID</p>
                  <p className="font-medium">{profile?.student_id || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{profile?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-medium">{profile?.department || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Upcoming Exams</h2>
          {exams.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No exams scheduled
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {exams.map((exam) => (
                <Card key={exam.id} className={isToday(exam.exam_date) ? "border-accent" : ""}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{exam.subject.name}</CardTitle>
                        <CardDescription>{exam.subject.code}</CardDescription>
                      </div>
                      {isToday(exam.exam_date) && (
                        <Badge variant="default" className="bg-accent text-accent-foreground">
                          Today
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {format(new Date(exam.exam_date), "EEEE, MMMM d, yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {exam.start_time} - {exam.end_time}
                        </span>
                      </div>
                      {exam.room && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            Room {exam.room.room_number}
                            {exam.room.building && `, ${exam.room.building}`}
                          </span>
                        </div>
                      )}
                      {exam.seating && (
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 flex items-center justify-center">
                            <div className="h-3 w-3 rounded bg-primary" />
                          </div>
                          <span className="text-sm font-medium">
                            Seat: {exam.seating.seat_number}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;