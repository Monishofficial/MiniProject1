import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Exam {
  id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  subjects: { name: string; code: string };
  rooms: { room_number: string; building: string } | null;
}

const ExamsTab = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    subject_id: "",
    exam_date: "",
    start_time: "",
    end_time: "",
    room_id: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: examsData }, { data: subjectsData }, { data: roomsData }] = await Promise.all([
      supabase.from("exams").select("*, subjects(name, code), rooms(room_number, building)").order("exam_date"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("rooms").select("*").order("room_number"),
    ]);

    if (examsData) setExams(examsData);
    if (subjectsData) setSubjects(subjectsData);
    if (roomsData) setRooms(roomsData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("exams").insert([formData]);
      if (error) throw error;

      toast.success("Exam scheduled successfully");
      setFormData({
        subject_id: "",
        exam_date: "",
        start_time: "",
        end_time: "",
        room_id: "",
      });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;

      toast.success("Exam deleted");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Exam</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Select
                  value={formData.subject_id}
                  onValueChange={(value) => setFormData({ ...formData, subject_id: value })}
                  required
                >
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
              <div className="space-y-2">
                <Label htmlFor="room">Room</Label>
                <Select
                  value={formData.room_id}
                  onValueChange={(value) => setFormData({ ...formData, room_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        Room {room.room_number} - {room.building}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam_date">Exam Date</Label>
                <Input
                  id="exam_date"
                  type="date"
                  value={formData.exam_date}
                  onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="mr-2 h-4 w-4" />
              Schedule Exam
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Exams</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {exams.map((exam) => (
              <div key={exam.id} className="flex justify-between items-center p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{exam.subjects.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <Calendar className="inline h-3 w-3 mr-1" />
                    {format(new Date(exam.exam_date), "MMM d, yyyy")} | {exam.start_time} - {exam.end_time}
                    {exam.rooms && ` | Room ${exam.rooms.room_number}`}
                  </p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(exam.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExamsTab;