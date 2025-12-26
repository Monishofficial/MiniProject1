import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
// ExcelJS is imported dynamically inside the upload handler to avoid bundler resolution issues
import { useRef } from "react";

interface Exam {
  id: string;
  exam_date: string;
  start_time: string;
  subjects: { name: string; code: string };
  rooms: { room_number: string; capacity: number };
}

interface SeatingArrangement {
  id: string;
  seat_number: string;
  row_number: number;
  column_number: number;
  profiles: { full_name: string; student_id: string };
  subjects: { name: string; code: string };
}

const SeatingTab = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [seating, setSeating] = useState<SeatingArrangement[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [antiCheatLevel, setAntiCheatLevel] = useState<"basic" | "strict" | "max">("basic");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    const { data } = await supabase
      .from("exams")
      .select("*, subjects(name, code), rooms(room_number, capacity)")
      .order("exam_date");

    if (data) setExams(data);
  };

  const fetchSeating = async (examId: string) => {
    // show loader / card while fetching
    setViewing(true);
    setSeating([]);

    // Fetch seating rows (include student_id so we can resolve profiles separately)
    const { data, error } = await supabase
      .from("seating_arrangements")
      .select("id, seat_number, row_number, column_number, student_id, exam_id")
      .eq("exam_id", examId)
      .order("seat_number", { ascending: true });

    if (error) {
      console.error("fetchSeating error:", error);
      toast.error(error.message || "Failed to fetch seating arrangements");
      setSeating([]);
      return;
    }

    // Resolve profiles for the student_ids (profiles.id == student_id)
    const studentIds = Array.from(new Set((data || []).map((d: any) => d.student_id))).filter(Boolean);
    let profilesMap: Map<string, any> = new Map();
    if (studentIds.length > 0) {
      try {
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, student_id, full_name")
          .in("id", studentIds);
        if (profilesErr) throw profilesErr;
        for (const p of profilesData || []) profilesMap.set((p as any).id, p);
      } catch (err) {
        console.warn("Failed to fetch profiles for seating rows", err);
      }
    }

    // Fetch exam to get subject info (fallback)
    let examSubject: any = null;
    try {
      const { data: examData } = await supabase.from("exams").select("subject_id").eq("id", examId).maybeSingle();
      if (examData?.subject_id) {
        const { data: subj } = await supabase.from("subjects").select("id, name, code").eq("id", examData.subject_id).maybeSingle();
        examSubject = subj || null;
      }
    } catch (err) {
      console.warn("Failed to fetch exam/subject information", err);
    }

    // Fetch student enrollments to derive each student's subject (prefer match to exam.subject_id, otherwise first enrollment)
    const studentSubjects = new Map<string, { id: string; name: string; code: string }>();
    if (studentIds.length > 0) {
      try {
        const { data: enrollments, error: enrollErr } = await supabase
          .from("student_enrollments")
          .select("student_id, subject_id, subjects(name, code)")
          .in("student_id", studentIds);
        if (enrollErr) throw enrollErr;
        // group enrollments by student
        const byStudent = new Map<string, any[]>();
        for (const e of enrollments || []) {
          if (!byStudent.has((e as any).student_id)) byStudent.set((e as any).student_id, []);
          byStudent.get((e as any).student_id).push(e);
        }
        for (const sid of studentIds) {
          const list = byStudent.get(sid) || [];
          if (list.length === 0 && examSubject) {
            studentSubjects.set(sid, examSubject);
            continue;
          }
          // prefer enrollment that matches examSubject id
          let chosen = list[0];
          if (examSubject) {
            const match = list.find((l) => (l as any).subject_id === examSubject.id);
            if (match) chosen = match;
          }
          if (chosen) {
            studentSubjects.set(sid, { id: (chosen as any).subject_id, name: (chosen as any).subjects?.name, code: (chosen as any).subjects?.code });
          } else if (examSubject) {
            studentSubjects.set(sid, examSubject);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch enrollments for seating subjects", err);
      }
    }

    const formatted = (data || []).map((item: any) => {
      const subj = studentSubjects.get(item.student_id) || examSubject;
      return {
        ...item,
        profiles: profilesMap.get(item.student_id) || { full_name: null, student_id: null },
        subjects: subj ? { name: subj.name, code: subj.code } : undefined,
      };
    });

    setSeating(formatted);
  };

  const handleGenerateSeating = async () => {
    if (!selectedExam) {
      toast.error("Please select an exam");
      return;
    }

    setLoading(true);
    try {
      // Call the edge function to generate seating
      const { data, error } = await supabase.functions.invoke("generate-seating", {
        body: { exam_id: selectedExam, anti_cheat_level: antiCheatLevel },
      });

      if (error) throw error;

      toast.success(data.message || "Seating arrangement generated successfully!");
      fetchSeating(selectedExam);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate seating");
    } finally {
      setLoading(false);
    }
  };

  const handleViewSeating = () => {
    if (!selectedExam) {
      toast.error("Please select an exam");
      return;
    }
    fetchSeating(selectedExam);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Load ExcelJS dynamically (avoids build-time import resolution errors in Vite)
      const ExcelJS = await import(/* webpackChunkName: "exceljs" */ "exceljs");
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        toast.error("No worksheet found in Excel file");
        return;
      }

      const rows: any[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const obj: any = {};
        row.eachCell((cell, colNumber) => {
          const headerCell = worksheet.getCell(1, colNumber);
          const header = headerCell.value ? String(headerCell.value).trim() : `col${colNumber}`;
          obj[header] = cell.value !== undefined && cell.value !== null ? cell.value : "";
        });
        rows.push(obj);
      });

      if (!rows || rows.length === 0) {
        toast.error("Excel file is empty or could not be parsed");
        return;
      }

      // Validate required columns
      const requiredCols = ["student_id", "full_name", "subject_code", "room_number", "exam_date"];
      const missing = requiredCols.filter((c) => !Object.keys(rows[0]).map((k) => k.toLowerCase()).includes(c));
      if (missing.length) {
        toast.error(`Missing required columns: ${missing.join(", ")}`);
        return;
      }

      setLoading(true);

      // Normalize, parse dates/times and group by exam (subject_code + exam_date + start_time + room_number)
      const examsMap = new Map<string, any[]>();
      const invalidRows: any[] = [];

      const parseExcelDate = (val: any) => {
        if (val === null || val === undefined || val === "") return null;
        // Handle Date objects from ExcelJS
        if (val instanceof Date) {
          return val.toISOString().slice(0, 10);
        }
        // numbers are Excel serial dates
        if (typeof val === "number" || /^\d+$/.test(String(val))) {
          const num = Number(val);
          // Fallback (Excel epoch: 1899-12-30 -> serial 1)
          const date = new Date(Math.round((num - 25569) * 86400 * 1000));
          if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
          return null;
        }

        // Try Date parsing for strings
        const d = new Date(String(val));
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

        // Try common delimiters (d/m/y or y-m-d)
        const parts = String(val).split(/[\/\.\-]/);
        if (parts.length === 3) {
          let [p1, p2, p3] = parts.map((p) => p.trim());
          if (p1.length === 4) {
            // year-month-day
            return `${p1}-${p2.padStart(2, "0")}-${p3.padStart(2, "0")}`;
          } else {
            // day-month-year
            return `${p3.padStart(4, "0")}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
          }
        }

        return null;
      };

      const parseExcelTime = (val: any) => {
        if (val === null || val === undefined || val === "") return null;
        // Excel times as fraction of a day
        if (typeof val === "number" || /^\d+(?:\.\d+)?$/.test(String(val))) {
          const num = Number(val);
          if (num > 0 && num < 1) {
            const totalMinutes = Math.round(num * 24 * 60);
            const hh = Math.floor(totalMinutes / 60);
            const mm = totalMinutes % 60;
            return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
          }
          // Numbers like 900 -> 09:00, 930 -> 09:30
          const s = String(num);
          if (s.length <= 2) return `${s.padStart(2, "0")}:00`;
          const hh = s.slice(0, s.length - 2);
          const mm = s.slice(s.length - 2);
          return `${String(Number(hh)).padStart(2, "0")}:${String(Number(mm)).padStart(2, "0")}`;
        }

        const t = String(val).trim();
        if (/^\d{1,2}:\d{2}/.test(t)) {
          const [h, m] = t.split(":");
          return `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}`;
        }
        return null;
      };

      for (const rawRow of rows) {
        const row: any = {};
        for (const key of Object.keys(rawRow)) {
          // keep raw values here for parsing (don't coerce to string yet)
          row[key.toLowerCase().trim()] = rawRow[key];
        }

        // Parse date & time
        const parsedDate = parseExcelDate(row.exam_date);
        const parsedTime = parseExcelTime(row.start_time || "");

        if (!parsedDate) {
          invalidRows.push({ row, reason: "invalid exam_date" });
          continue; // skip invalid row
        }

        row.exam_date = parsedDate;
        row.start_time = parsedTime || "09:00";

        // Normalize all values to strings for DB upsert
        for (const k of Object.keys(row)) {
          if (row[k] !== null && row[k] !== undefined) row[k] = String(row[k]).trim();
        }

        const key = `${row.subject_code}||${row.exam_date}||${row.start_time || ""}||${row.room_number}`;
        if (!examsMap.has(key)) examsMap.set(key, []);
        examsMap.get(key)!.push(row);
      }

      if (invalidRows.length > 0) {
        toast.warn(`${invalidRows.length} rows were skipped due to invalid dates or times. Check the template format.`);
      }

      for (const [key, groupRows] of examsMap.entries()) {
        const first = groupRows[0];
        // Upsert subject
        const { data: subjectData, error: subjectErr } = await supabase
          .from("subjects")
          .upsert(
            { code: first.subject_code, name: first.subject_name || first.subject_code },
            { onConflict: "code" }
          )
          .select("*")
          .single();
        if (subjectErr) throw subjectErr;

        // Upsert room
        const { data: roomData, error: roomErr } = await supabase
          .from("rooms")
          .upsert(
            { room_number: first.room_number, capacity: Number(first.room_capacity) || 50 },
            { onConflict: "room_number" }
          )
          .select("*")
          .single();
        if (roomErr) throw roomErr;

        // Upsert exam (fall back to select if DB is missing the unique constraint)
        let examData: any = null;

        const computeEndTime = (start: string, durationMinutes?: number) => {
          const [hh, mm] = String(start).split(":").map((s) => Number(s) || 0);
          const date = new Date(0, 0, 0, hh, mm);
          const duration = Number(durationMinutes) || 120; // default 120 minutes
          date.setMinutes(date.getMinutes() + duration);
          const h2 = String(date.getHours()).padStart(2, "0");
          const m2 = String(date.getMinutes()).padStart(2, "0");
          return `${h2}:${m2}:00`;
        };

        try {
          const startTime = first.start_time || "09:00";
          const durationMinutes = Number(first.duration_minutes) || 120;
          const endTime = computeEndTime(startTime, durationMinutes);

          const res = await supabase
            .from("exams")
            .upsert(
              {
                subject_id: subjectData.id,
                room_id: roomData.id,
                exam_date: first.exam_date,
                start_time: startTime,
                end_time: endTime,
                duration_minutes: durationMinutes,
              },
              { onConflict: ["subject_id", "exam_date", "start_time", "room_id"] }
            )
            .select("*")
            .single();

          examData = res.data;
          if (res.error) throw res.error;
        } catch (err: any) {
          // If Postgres rejects ON CONFLICT because there's no unique constraint yet,
          // attempt to find an existing exam with the same keys (so the import can proceed).
          if (err && /no unique or exclusion constraint/i.test(err.message || "")) {
            // DB doesn't have the unique constraint yet. Try to find an existing exam with same keys.
            const { data: existingExam, error: selErr } = await supabase
              .from("exams")
              .select("*")
              .eq("subject_id", subjectData.id)
              .eq("exam_date", first.exam_date)
              .eq("start_time", first.start_time || "09:00")
              .eq("room_id", roomData.id)
              .maybeSingle();

            if (selErr) throw selErr;

            if (existingExam) {
              examData = existingExam;
              toast.warning("Exam upsert fallback: found existing exam without constraint; using existing record.");
            } else {
              // No existing exam, insert a new one (can't rely on ON CONFLICT without the constraint)
              const startTime = first.start_time || "09:00";
              const durationMinutes = Number(first.duration_minutes) || 120;
              const endTime = computeEndTime(startTime, durationMinutes);

              const { data: insertedExam, error: insertErr } = await supabase
                .from("exams")
                .insert({
                  subject_id: subjectData.id,
                  room_id: roomData.id,
                  exam_date: first.exam_date,
                  start_time: startTime,
                  end_time: endTime,
                  duration_minutes: durationMinutes,
                })
                .select("*")
                .single();

              if (insertErr) {
                throw insertErr;
              }

              examData = insertedExam;
              toast.warning(
                "Exam upsert fallback: inserted a new exam because the DB is missing the expected unique constraint. Please run the migration to add the constraint."
              );
            }
          } else {
            throw err;
          }
        }

        // Prepare profile inserts
        const profileInserts: any[] = [];
        for (const r of groupRows) {
          profileInserts.push({ full_name: r.full_name, student_id: r.student_id });
        }

        // Bulk upsert profiles (by student_id)
        const { error: profilesErr } = await supabase.from("profiles").upsert(profileInserts, {
          onConflict: "student_id",
        });
        if (profilesErr) throw profilesErr;

        // Fetch profiles to obtain auth user UUIDs for enrollments/seating
        const studentIds = Array.from(new Set(profileInserts.map((p) => p.student_id)));
        const { data: profilesData, error: profilesSelErr } = await supabase
          .from("profiles")
          .select("id, student_id")
          .in("student_id", studentIds);
        if (profilesSelErr) throw profilesSelErr;

        const studentIdToUUID = new Map<string, string>();
        for (const p of profilesData || []) {
          studentIdToUUID.set((p as any).student_id, (p as any).id);
        }

        const missingStudents = studentIds.filter((sid) => !studentIdToUUID.has(sid));
        if (missingStudents.length > 0) {
          // If any student_id does not correspond to an auth user (profiles.id -> auth.users.id), abort and inform admin
          toast.error(
            `Import aborted: the following student IDs do not have corresponding user accounts: ${missingStudents.join(", ")}. Please create users first or map student IDs to auth users.`
          );
          throw new Error(`Missing auth users for student IDs: ${missingStudents.join(", ")}`);
        }

        // Build enrollments using actual auth user UUIDs
        const enrollInserts: any[] = [];
        for (const r of groupRows) {
          const uid = studentIdToUUID.get(r.student_id);
          enrollInserts.push({ student_id: uid, subject_id: subjectData.id });
        }

        // Bulk upsert enrollments (student_id must be auth.users.id)
        const { error: enrollErr } = await supabase.from("student_enrollments").upsert(enrollInserts, {
          onConflict: ["student_id", "subject_id"],
        });
        if (enrollErr) throw enrollErr;

        // Optionally auto-generate seating
        if (autoGenerate) {
          const { data: genData, error: genErr } = await supabase.functions.invoke("generate-seating", {
            body: { exam_id: examData.id, anti_cheat_level: antiCheatLevel },
          });
          if (genErr) throw genErr;

          // Show generated seating for this exam
          setSelectedExam(examData.id);
          await fetchSeating(examData.id);
          setViewing(true);
        }
      }

      toast.success("Excel import completed successfully");
      fetchExams();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to import Excel file");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Download a sample Excel template (client-side generated)
  const handleDownloadTemplate = async () => {
    try {
      const ExcelJS = await import("exceljs");

      const headers = [
        "student_id",
        "full_name",
        "subject_code",
        "subject_name",
        "room_number",
        "room_capacity",
        "exam_date",
        "start_time",
      ];

      const sample = [
        {
          student_id: "S001",
          full_name: "John Doe",
          subject_code: "MATH101",
          subject_name: "Calculus I",
          room_number: "R101",
          room_capacity: 50,
          exam_date: new Date().toISOString().slice(0, 10),
          start_time: "09:00",
        },
      ];

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("template");
      worksheet.columns = headers.map(h => ({ header: h, key: h }));
      worksheet.addRow(sample[0]);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "seating_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Template downloaded");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to generate template");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI-Powered Seating Arrangement</CardTitle>
          <CardDescription>
            Generate intelligent seating that prevents students with the same subject from sitting adjacent to each
            other
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Exam</Label>
              <Select value={selectedExam} onValueChange={setSelectedExam}>
                <SelectTrigger>
                  <SelectValue placeholder="Select exam" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.subjects.name} - {new Date(exam.exam_date).toLocaleDateString()} at {exam.start_time} (Room{" "}
                      {exam.rooms?.room_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGenerateSeating} disabled={loading || !selectedExam}>
                <Sparkles className="mr-2 h-4 w-4" />
                {loading ? "Generating..." : "Generate Seating"}
              </Button>
              <Button variant="outline" onClick={handleViewSeating} disabled={!selectedExam}>
                <Eye className="mr-2 h-4 w-4" />
                View Seating
              </Button>
            </div>

            {/* Excel Upload Section */}
            <div className="mt-4 space-y-3">
              <Label htmlFor="excelFile">Upload Excel (columns: student_id, full_name, subject_code, subject_name, room_number, room_capacity, exam_date, start_time)</Label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                <div className="md:col-span-2">
                  <Input
                    id="excelFile"
                    aria-label="Upload Excel file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    ref={fileInputRef}
                    onChange={(e) => handleExcelUpload(e)}
                  />
                  <p className="mt-1 text-sm text-muted-foreground">Accepted formats: .xlsx, .xls, .csv — first sheet will be used</p>

                  <div className="mt-3 flex gap-2">
                    <Button onClick={handleDownloadTemplate}>Download Template</Button>
                    <Button variant="outline" onClick={() => {
                      // clear the input
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      setAutoGenerate(false);
                    }}>Clear</Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={autoGenerate}
                    onCheckedChange={(val) => setAutoGenerate(Boolean(val))}
                    id="autoGenerate"
                  />
                  <Label htmlFor="autoGenerate">Auto-generate after import</Label>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Label>Anti-cheat level</Label>
                <div className="w-40">
                  <Select value={antiCheatLevel} onValueChange={(v) => setAntiCheatLevel(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="strict">Strict</SelectItem>
                      <SelectItem value="max">Max</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </div> 
          </div>
        </CardContent>
      </Card>

      {viewing && (
        <Card>
          <CardHeader>
            <CardTitle>Seating Arrangement</CardTitle>
            <CardDescription>
              {seating.length > 0
                ? `${seating.length} students seated`
                : "No seating arrangement generated for this exam"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {seating.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {seating.map((seat) => (
                  <div key={seat.id} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium">{seat.profiles?.full_name}</p>
                      <Badge variant="secondary">Seat {seat.seat_number}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Student ID: {seat.profiles?.student_id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Subject: {seat.subjects?.name} ({seat.subjects?.code})
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Position: Row {seat.row_number}, Col {seat.column_number}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No seating arrangement yet</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SeatingTab;