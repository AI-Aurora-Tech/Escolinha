import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // First ensure the column exists - if we can't run ALTER TABLE, we hope it already exists.
  // Actually, if it doesn't exist, this script will fail, which is fine, 
  // users can then add the column manually if needed.
  
  const { data: students, error: fetchError } = await supabase
    .from('students')
    .select('id, enrollment_date, created_at')
    .is('enrollment_date', null);

  if (fetchError) {
    console.error('Error fetching students:', fetchError);
    return;
  }

  if (students && students.length > 0) {
    for (const student of students) {
        const updateData = {
            enrollment_date: student.created_at || new Date().toISOString().split('T')[0]
        };
        const { error: updateError } = await supabase
            .from('students')
            .update(updateData)
            .eq('id', student.id);
        
        if (updateError) {
            console.error(`Error updating student ${student.id}:`, updateError);
        } else {
            console.log(`Updated student ${student.id} with enrollment_date ${updateData.enrollment_date}`);
        }
    }
  } else {
    console.log('No students found needing enrollment_date backfill');
  }
}

run();
