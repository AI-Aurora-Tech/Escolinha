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

async function checkColumns() {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching students:', error);
  } else if (data && data.length > 0) {
    console.log('Available columns:', Object.keys(data[0]));
    
    // Attempt backfill
    const { data: allStudents, error: fetchError } = await supabase
        .from('students')
        .select('id, active, created_at');
        
    if (fetchError) {
        console.error('Error fetching all students:', fetchError);
        return;
    }

    const availableCols = Object.keys(data[0]);
    const enrollmentCol = availableCols.find(col => col.toLowerCase().includes('enrollment') || col.toLowerCase().includes('matricula'));
    const inactivationCol = availableCols.find(col => col.toLowerCase().includes('inactivation') || col.toLowerCase().includes('inativacao'));

    if (!enrollmentCol || !inactivationCol) {
        console.error('Could not identify enrollment or inactivation columns');
        return;
    }

    console.log(`Using columns: ${enrollmentCol} and ${inactivationCol}`);

    for (const student of allStudents) {
        const updateData: any = {};
        
        // Enrollment date is created_at
        updateData[enrollmentCol] = student.created_at || new Date().toISOString().split('T')[0];
        
        // If inactive, set inactivation date to today
        if (!student.active) {
            updateData[inactivationCol] = new Date().toISOString().split('T')[0];
        }

        const { error: updateError } = await supabase
            .from('students')
            .update(updateData)
            .eq('id', student.id);
        
        if (updateError) {
            console.error(`Error updating student ${student.id}:`, updateError);
        } else {
            console.log(`Updated student ${student.id} (${!student.active ? 'INACTIVE' : 'ACTIVE'})`);
        }
    }
  } else {
    console.log('No students found');
  }
}

checkColumns();
