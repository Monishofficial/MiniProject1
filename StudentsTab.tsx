import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface Student {
  id: string;
  student_id: string;
  full_name: string;
  email: string;
  department: string;
}

interface Enrollment {
  id: string;
  subjects: { name: string; code: string };
  profiles: { full_name: string; student_id: string };
}

const StudentsTab = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: studentsData }, { data: subjectsData }, { data: enrollmentsData }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("student_enrollments").select("id, student_id, subject_id, subjects(name, code)"),
    ]);

    if (studentsData) setStudents(studentsData);
    if (subjectsData) setSubjects(subjectsData);
    
    if (enrollmentsData) {
      // Fetch profile data separately for enrollments
      const enrollmentsWithProfiles = await Promise.all(
        enrollmentsData.map(async (enrollment: any) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, student_id")
            .eq("id", enrollment.student_id)
            .single();
          
          return {
            ...enrollment,
            profiles: profile || { full_name: "Unknown", student_id: "N/A" },
          };
        })
      );
      setEnrollments(enrollmentsWithProfiles);
    }
  };

  const handleEnroll = async () => {
    if (!selectedStudent || !selectedSubject) {
      toast.error("Please select both student and subject");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("student_enrollments").insert([
        {
          student_id: selectedStudent,
          subject_id: selectedSubject,
        },
      ]);

      if (error) throw error;

      toast.success("Student enrolled successfully");
      setSelectedStudent("");
      setSelectedSubject("");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEnrollment = async (id: string) => {
    try {
      const { error } = await supabase.from("student_enrollments").delete().eq("id", id);
      if (error) throw error;

      toast.success("Enrollment removed");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enroll Student in Subject</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Student</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.full_name} ({student.student_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name} ({subject.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleEnroll} disabled={loading}>
              <Plus className="mr-2 h-4 w-4" />
              Enroll Student
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student Enrollments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="flex justify-between items-center p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{enrollment.profiles?.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {enrollment.profiles?.student_id} | {enrollment.subjects?.name} ({enrollment.subjects?.code})
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteEnrollment(enrollment.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Students</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {students.map((student) => (
              <div key={student.id} className="p-3 border rounded-lg">
                <p className="font-medium">{student.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  ID: {student.student_id} | {student.email} | {student.department || "No department"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentsTab;