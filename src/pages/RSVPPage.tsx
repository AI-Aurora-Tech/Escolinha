import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { Activity, Student, TransactionType, PaymentStatus, PaymentMethod } from '../../types';
import { sendZApiMessage } from '../../services/zapiService';
import { createPixPayment } from '../../services/mercadoPago';
import { CheckCircle, XCircle, Calendar, MapPin, Clock, Trophy, Loader2, Copy, QrCode } from 'lucide-react';

export const RSVPPage: React.FC = () => {
  const { activityId, studentId } = useParams<{ activityId: string; studentId: string }>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'PENDING' | 'CONFIRMED' | 'DECLINED' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pixData, setPixData] = useState<{ copyPaste: string, qrCodeBase64: string } | null>(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [externalRef, setExternalRef] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  useEffect(() => {
    if (!externalRef || paymentConfirmed) return;

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/payment-status/${externalRef}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'approved') {
                    setPaymentConfirmed(true);
                    setPixData(null);
                    clearInterval(interval);
                }
            }
        } catch (e) {
            console.error("Error polling payment status", e);
        }
    }, 5000);

    return () => clearInterval(interval);
  }, [externalRef, paymentConfirmed]);

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
            console.log("Activity Data:", actRes.data);
            setActivity({
                ...actRes.data,
                startTime: actRes.data.start_time,
                endTime: actRes.data.end_time,
                presentationTime: actRes.data.presentation_time,
                type: actRes.data.activity_type,
                fee: Number(actRes.data.fee) // Ensure fee is a number
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
    setPixData(null); // Reset PIX data on new response

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

          console.log("Checking fee for transaction creation:", activity.fee);

          // Generate PIX if fee exists
          if (activity.fee && activity.fee > 0) {
              console.log("Fee exists, proceeding to create transaction...");
              setGeneratingPix(true);
              try {
                  // Use deterministic reference to prevent duplicates
                  const externalRef = `GAME-${activityId}-${studentId}`;
                  console.log("External Reference:", externalRef);
                  
                  // Check if transaction already exists (ignoring cancelled ones)
                  const { data: existingTx, error: checkError } = await supabase
                      .from('transactions')
                      .select('*')
                      .eq('external_reference', externalRef)
                      .neq('status', PaymentStatus.CANCELLED)
                      .maybeSingle();

                  if (checkError) {
                      console.error("Error checking existing transaction:", checkError);
                  }

                  if (existingTx && existingTx.status === PaymentStatus.PAID) {
                      console.log("Transaction already paid:", existingTx);
                      setPaymentConfirmed(true);
                      msg += `\n\n✅ *Pagamento já realizado!*`;
                  } else {
                      // If not exists, create it
                      if (!existingTx) {
                          console.log("Creating new transaction...");
                          const { error: txError } = await supabase.from('transactions').insert({
                              description: `Taxa Jogo: ${activity.title}`,
                              category: 'Taxa de Atividade',
                              amount: activity.fee,
                              type: TransactionType.INCOME,
                              date: new Date().toISOString().split('T')[0],
                              status: PaymentStatus.PENDING,
                              student_id: studentId,
                              payment_method: PaymentMethod.PIX_MERCADO_PAGO,
                              external_reference: externalRef
                          });
                          
                          if (txError) {
                              console.error("Erro ao criar transação (INSERT failed):", txError);
                              alert(`Erro ao criar taxa de jogo: ${txError.message}`);
                              throw txError;
                          }
                          console.log("Transaction created successfully.");
                      } else {
                          console.log("Pending transaction found, reusing...");
                      }

                      setExternalRef(externalRef); // Start polling

                      // Generate PIX (idempotent on MP side if we used same key, but here we just want a fresh code for the same ref)
                      const pixResult = await createPixPayment({
                          title: `Taxa Jogo: ${activity.title}`,
                          price: activity.fee,
                          externalReference: externalRef,
                          payer: {
                              name: student.guardian.name,
                              email: student.guardian.email,
                              phone: student.guardian.phone,
                              identification: { type: 'CPF', number: student.guardian.cpf || '' }
                          }
                      });

                      if (pixResult) {
                          setPixData({
                              copyPaste: pixResult.qrCode,
                              qrCodeBase64: pixResult.qrCodeBase64
                          });
                          msg += `\n\n💰 *Pagamento Pendente*\nValor: R$ ${activity.fee.toFixed(2)}\n\nUtilize o código PIX Copia e Cola abaixo para pagar:\n\n${pixResult.qrCode}`;
                      }
                  }
              } catch (pixErr) {
                  console.error("Erro ao gerar PIX:", pixErr);
              } finally {
                  setGeneratingPix(false);
              }
          }
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

  const copyToClipboard = () => {
      if (pixData?.copyPaste) {
          navigator.clipboard.writeText(pixData.copyPaste);
          alert('Código PIX copiado!');
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
            
            {activity.fee && activity.fee > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center">
                    <p className="text-xs font-bold text-gray-400 uppercase">Taxa do Jogo</p>
                    <p className="font-bold text-green-600">R$ {activity.fee.toFixed(2)}</p>
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
                        
                        {generatingPix && (
                            <div className="mt-4 flex items-center gap-2 text-gray-500 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Gerando código PIX...
                            </div>
                        )}

                        {paymentConfirmed && (
                             <div className="mt-4 bg-green-100 text-green-800 p-3 rounded-lg font-bold text-sm flex items-center gap-2 animate-in fade-in zoom-in">
                                <CheckCircle className="w-4 h-4" />
                                Pagamento Recebido!
                             </div>
                        )}

                        {pixData && !paymentConfirmed && (
                            <div className="mt-6 w-full bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                                    <QrCode className="w-4 h-4" />
                                    Pagamento via PIX
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">Escaneie o QR Code ou copie o código abaixo para pagar a taxa do jogo.</p>
                                
                                <div className="flex justify-center mb-4">
                                    <img 
                                        src={`data:image/png;base64,${pixData.qrCodeBase64}`} 
                                        alt="QR Code PIX" 
                                        className="w-48 h-48 object-contain border border-gray-100 rounded-lg"
                                    />
                                </div>

                                <div className="relative">
                                    <textarea 
                                        readOnly 
                                        value={pixData.copyPaste}
                                        className="w-full h-20 bg-gray-50 border border-gray-200 rounded-lg p-2 text-[10px] text-gray-500 break-all resize-none focus:outline-none"
                                    />
                                    <button 
                                        onClick={copyToClipboard}
                                        className="absolute bottom-2 right-2 bg-green-600 text-white text-xs font-bold py-1 px-3 rounded-md shadow-sm hover:bg-green-700 transition-colors flex items-center gap-1"
                                    >
                                        <Copy className="w-3 h-3" />
                                        Copiar
                                    </button>
                                </div>
                            </div>
                        )}
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
                    {!pixData && (
                        <button onClick={() => setStatus(null)} className="text-xs font-bold text-gray-400 underline hover:text-gray-600">
                            Alterar resposta
                        </button>
                    )}
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
