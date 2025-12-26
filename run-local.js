import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

function loadDotEnv(envPath = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = process.env[key] ?? val;
  }
}

loadDotEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.RESEND_API_KEY;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL in env (.env)');
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in env (.env)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

(async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];

    console.log('Checking for exams on:', tomorrowDate);

    const { data: exams, error: examsError } = await supabase
      .from('exams')
      .select('id, exam_date, start_time, end_time, subject_id, room_id')
      .eq('exam_date', tomorrowDate);

    if (examsError) {
      console.error('Error fetching exams:', examsError);
      process.exit(1);
    }

    if (!exams || exams.length === 0) {
      console.log('No exams scheduled for tomorrow.');
      process.exit(0);
    }

    let notificationsSent = 0;
    for (const exam of exams) {
      // Try seating_arrangements first
      let seatingData = [];
      const seatingRes = await supabase
        .from('seating_arrangements')
        .select('seat_number, row_number, column_number, student_id')
        .eq('exam_id', exam.id);
      if (!seatingRes.error && seatingRes.data) seatingData = seatingRes.data;

      if (!seatingData.length) {
        const enrollRes = await supabase
          .from('enrollments')
          .select('student_id')
          .eq('exam_id', exam.id);
        if (!enrollRes.error && enrollRes.data) {
          seatingData = enrollRes.data.map((r) => ({ student_id: r.student_id }));
        }
      }

      for (const seating of seatingData) {
        const studentId = seating.student_id;
        if (!studentId) continue;

        const { data: studentRows, error: studentError } = await supabase
          .from('students')
          .select('id, full_name, email')
          .eq('id', studentId)
          .limit(1);

        if (studentError || !studentRows || !studentRows.length) {
          console.warn('Could not fetch student for id', studentId, studentError);
          continue;
        }

        const profile = studentRows[0];
        if (!profile.email) {
          console.warn('Student has no email:', profile);
          continue;
        }

        const subjectLine = `Reminder: Exam Tomorrow`;
        const html = `\n          <div>\n            <h1>Exam Reminder</h1>\n            <p>Dear ${profile.full_name || 'Student'},</p>\n            <p>This is a reminder that you have an exam scheduled for <strong>tomorrow</strong>.</p>\n            <p><strong>Date:</strong> ${exam.exam_date}</p>\n            <p><strong>Time:</strong> ${exam.start_time} - ${exam.end_time}</p>\n            <p><strong>Seat Number:</strong> ${seating.seat_number || 'N/A'}</p>\n            <p>Good luck!</p>\n          </div>\n        `;

        if (resend) {
          try {
            const r = await resend.emails.send({
              from: 'Exam Notifications <onboarding@resend.dev>',
              to: profile.email,
              subject: subjectLine,
              html,
            });
            console.log('Email sent to', profile.email, r.id ?? 'ok');
            notificationsSent++;
          } catch (err) {
            console.error('Failed to send email to', profile.email, err);
          }
        } else {
          console.log('DRY RUN - would send email to:', profile.email);
          console.log('Subject:', subjectLine);
          console.log('HTML snippet:', html.slice(0, 200));
        }
      }
    }

    console.log(`Done. Notifications sent: ${notificationsSent}`);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
