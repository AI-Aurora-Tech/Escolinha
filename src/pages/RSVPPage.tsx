import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Activity, Student } from '../../types';
import { sendZApiMessage } from '../../services/zapiService';
import { CheckCircle, XCircle, Calendar, MapPin, Clock, Trophy, Loader2 } from 'lucide-react';

export const RSVPPage: React.FC = () => {
  const { activityId, studentId } = useParams<{ activityId: string; studentId: string }>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'PENDING' | 'CONFIRMED' | 'DECLINED' | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!activityId || !studentId) return;
      try {
        const [actRes, stuRes, rsvpRes] = await Promise.all([
          supabase.from('activities').select('*').eq('id', activityId).single(),
          supabase.from('students').select('*').eq('id', studentId).single(),
          supabase.from('activity_rsvps').select('*').eq('activity_id', activityId).eq('student_id', studentId).maybeSingle()
        ]);

        if (actRes.data) {
            setActivity({
                ...actRes.data,
                startTime: actRes.data.start_time,
                endTime: actRes.data.end_time,
                presentationTime: actRes.data.presentation_time,
                type: actRes.data.activity_type
            } as any);
        }
        if (stuRes.data) setStudent(stuRes.data as any);
        if (rsvpRes.data) setStatus(rsvpRes.data.status);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activityId, studentId]);

  const handleResponse = async (newStatus: 'CONFIRMED' | 'DECLINED') => {
    if (!activityId || !studentId || !student || !activity) return;
    setProcessing(true);
    try {
      // Upsert RSVP
      const { error } = await supabase.from('activity_rsvps').upsert(
        { activity_id: activityId, student_id: studentId, status: newStatus },
        { onConflict: 'activity_id,student_id' }
      );

      if (error) throw error;
      setStatus(newStatus);

      // Send WhatsApp Confirmation
      const firstName = student.guardian.name.split(' ')[0];
      let msg = '';
      if (newStatus === 'CONFIRMED') {
          msg = `Olá ${firstName}! Recebemos a confirmação de presença do atleta *${student.name}* para o jogo *${activity.title}*. ⚽🔥\n\nContamos com a torcida!`;
      } else {
          msg = `Olá ${firstName}. Recebemos a informação de ausência do atleta *${student.name}* para o jogo *${activity.title}*.\n\nObrigado por avisar! 👍`;
      }
      
      // Fire and forget to not block UI
      sendZApiMessage(student.guardian.phone, msg).catch(err => console.error("Erro ao enviar confirmação zap:", err));

    } catch (err) {
      alert('Erro ao salvar resposta. Tente novamente.');
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>;
  if (!activity || !student) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Atividade ou aluno não encontrado.</div>;

  const isGame = activity.type === 'GAME';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden">
        <div className={`p-6 text-center ${isGame ? 'bg-yellow-500' : 'bg-primary-600'} text-white`}>
          <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
            {isGame ? <Trophy className="w-8 h-8" /> : <Calendar className="w-8 h-8" />}
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight mb-1">{isGame ? 'Convocação de Jogo' : 'Confirmação de Treino'}</h1>
          <p className="opacity-90 font-medium">Garotos do Martinica</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Atleta Convocado</p>
            <h2 className="text-xl font-bold text-gray-800">{student.name}</h2>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-bold text-gray-800">{activity.title}</p>
                <p className="text-sm text-gray-500">{new Date(activity.date).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">
                    Início: <span className="font-bold">{activity.startTime}</span>
                    {activity.presentationTime && ` • Chegar às: ${activity.presentationTime}`}
                </p>
              </div>
            </div>

            {activity.location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <p className="text-sm text-gray-600">{activity.location}</p>
              </div>
            )}

            {isGame && activity.opponent && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs font-bold text-gray-400 uppercase">Adversário</p>
                    <p className="font-bold text-gray-800">{activity.opponent}</p>
                </div>
            )}
          </div>

          {status ? (
            <div className={`p-6 rounded-xl text-center animate-in zoom-in duration-300 ${status === 'CONFIRMED' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                {status === 'CONFIRMED' ? (
                    <div className="flex flex-col items-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mb-2" />
                        <h3 className="text-lg font-black text-green-700 uppercase">Presença Confirmada!</h3>
                        <p className="text-sm text-green-600 mt-1">Bom jogo, craque! ⚽🔥</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <XCircle className="w-12 h-12 text-red-500 mb-2" />
                        <h3 className="text-lg font-black text-red-700 uppercase">Ausência Informada</h3>
                        <p className="text-sm text-red-600 mt-1">Que pena! Nos vemos na próxima.</p>
                    </div>
                )}
                
                <div className="mt-6 flex flex-col gap-3">
                    <button 
                        onClick={() => window.close()} 
                        className={`w-full py-3 rounded-xl font-black uppercase text-sm shadow-sm transition-all ${status === 'CONFIRMED' ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200'}`}
                    >
                        Fechar Janela
                    </button>
                    <button onClick={() => setStatus(null)} className="text-xs font-bold text-gray-400 underline hover:text-gray-600">
                        Alterar resposta
                    </button>
                </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => handleResponse('DECLINED')}
                disabled={processing}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-red-100 bg-white text-red-600 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50"
              >
                <XCircle className="w-8 h-8" />
                <span className="font-bold uppercase text-sm">Não poderei ir</span>
              </button>

              <button 
                onClick={() => handleResponse('CONFIRMED')}
                disabled={processing}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-green-600 text-white shadow-lg shadow-green-200 hover:bg-green-700 hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                <CheckCircle className="w-8 h-8" />
                <span className="font-black uppercase text-sm">Confirmar Presença</span>
              </button>
            </div>
          )}
        </div>
        <div className="bg-gray-50 p-4 text-center text-[10px] text-gray-400 uppercase font-bold tracking-widest">
            Garotos do Martinica • Gestão Esportiva
        </div>
      </div>
    </div>
  );
};
