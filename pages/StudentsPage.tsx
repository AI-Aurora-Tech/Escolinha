
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Group, Plan, Transaction, TransactionType, PaymentStatus, PaymentMethod, Activity, User, UserRole, Occurrence } from '../types';
import { Search, Plus, Phone, User as UserIcon, Edit, Camera, X, CheckSquare, Square, FileSpreadsheet, FileText, Filter, HeartPulse, ShieldCheck, MessageCircle, MapPin, Loader2, Printer, Wallet, QrCode, CheckCircle, Clock, Link as LinkIcon, History, XCircle, Download, Calculator, AlertTriangle, FileWarning, FolderCheck, Upload, RefreshCw, Copy, Send, Lock, PlusCircle, Calendar, CalendarCheck, Ban, Zap, Play, Pause, Ticket, Trophy, Medal, ChevronDown, Layers, Settings2, Banknote as CashIcon, Share2, MessageSquareWarning, Target } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPixPayment, createMPPreference } from '../services/mercadoPago';
import { sendZApiMessage } from '../services/zapiService';

interface StudentsPageProps {
  students: Student[];
  groups: Group[];
  plans: Plan[];
  transactions: Transaction[];
  activities: Activity[];
  occurrences: Occurrence[];
  onAddStudent: (s: Omit<Student, 'id'>) => void;
  onBatchAddStudents: (s: Omit<Student, 'id'>[]) => void;
  onUpdateStudent: (s: Student) => void;
  onUpdateTransaction: (t: Partial<Transaction>) => void;
  onAddTransaction: (t: Omit<Transaction, 'id'>) => void;
  onAddOccurrence: (studentId: string, description: string, date: string) => Promise<boolean>;
  onGenerateTuitions: () => Promise<void>;
  initialFilter?: string;
  currentUser?: User | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ students, groups, plans, transactions, activities, occurrences, onAddStudent, onBatchAddStudents, onUpdateStudent, onUpdateTransaction, onAddTransaction, onAddOccurrence, onGenerateTuitions, initialFilter, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [medicalFilter, setMedicalFilter] = useState('ALL');
  const [financeFilter, setFinanceFilter] = useState('ALL'); 
  const [docsFilter, setDocsFilter] = useState('ALL'); 
  const [planFilter, setPlanFilter] = useState('ALL');
  const [positionFilter, setPositionFilter] = useState('ALL');
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'FINANCE' | 'ATTENDANCE' | 'OCCURRENCES'>('DETAILS');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filtros de presença
  const [attendanceMonth, setAttendanceMonth] = useState<number>(new Date().getMonth());
  const [attendanceYear, setAttendanceYear] = useState<number>(new Date().getFullYear());
  
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string; id: number } | null>(null);
  const [pixTxIds, setPixTxIds] = useState<string[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedFinanceIds, setSelectedFinanceIds] = useState<Set<string>>(new Set());

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);

  const [showChargeModal, setShowChargeModal] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [manualCharge, setManualCharge] = useState({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });

  const [showOccurrenceModal, setShowOccurrenceModal] = useState(false);
  const [newOccurrence, setNewOccurrence] = useState({ description: '', date: new Date().toISOString().split('T')[0], studentId: '' });

  const isGuardian = currentUser?.role === UserRole.RESPONSAVEL;

  const positionsList = ['Goleiro', 'Lateral Direito', 'Zagueiro', 'Lateral Esquerdo', 'Volante', 'Meia', 'Atacante'];

  // Use local time for YYYY-MM-DD comparison to avoid UTC mismatch (e.g. at night)
  const todayStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
        if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
            setIsCategoryDropdownOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [categoryDropdownRef]);

  useEffect(() => {
    if (initialFilter === 'DEFAULTING') setFinanceFilter('DEFAULTING');
    else if (initialFilter === 'MISSING_DOCS') setDocsFilter('MISSING_DOCS');
  }, [initialFilter]);

  // Monitora se as transações vinculadas ao QR Code atual foram pagas pelo background reconciliation
  useEffect(() => {
      if (showPixModal && pixTxIds.length > 0) {
          const allPaid = pixTxIds.every(id => {
              const tx = transactions.find(t => t.id === id);
              return tx?.status === PaymentStatus.PAID;
          });
          if (allPaid) {
              confirmPixPaymentSuccess();
          }
      }
  }, [transactions, showPixModal, pixTxIds]);

  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return 0;
    const today = new Date(); const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateString;
  };

  const isMedicalExpired = (dateString: string) => {
    if (!dateString) return true;
    return new Date(dateString) < new Date();
  };

  const hasMissingDocs = (student: Student) => {
      if (!student.documents) return true;
      const d = student.documents as any;
      const check = (doc: any) => (typeof doc === 'boolean' ? doc : doc?.delivered);
      return !check(d.rg) || !check(d.cpf) || !check(d.medical) || !check(d.address) || !check(d.school);
  };

  const getStudentOverdueCount = (studentId: string) => {
    return transactions.filter(t => t.studentId === studentId && t.type === TransactionType.INCOME && t.status !== PaymentStatus.PAID && t.status !== PaymentStatus.CANCELLED && t.date < todayStr).length;
  };

  const handleGenerateContract = (student: Student) => {
    const doc = new jsPDF();
    const plan = plans.find(p => p.id === student.planId);
    const today = new Date().toLocaleDateString('pt-BR');
    
    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS ESPORTIVOS", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text("Garotos do Martinica", 105, 28, { align: 'center' });
    
    // Dados da Escola
    doc.setFontSize(10);
    doc.text("DADOS DA UNIDADE:", 14, 40);
    doc.setFont("helvetica", "normal");
    doc.text("Escola: Garotos do Martinica", 14, 45);
    doc.text("Endereço: Unidade Martinica - São Paulo/SP", 14, 50);

    // Dados do Responsável
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO RESPONSÁVEL (CONTRATANTE):", 14, 60);
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${student.guardian.name}`, 14, 65);
    doc.text(`CPF: ${student.guardian.cpf || '-'}`, 14, 70);
    doc.text(`Telefone: ${student.guardian.phone}`, 100, 70);
    doc.text(`Email: ${student.guardian.email || '-'}`, 14, 75);

    // Dados do Aluno
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO ALUNO (ATLETA):", 14, 85);
    doc.setFont("helvetica", "normal");
    doc.text(`Nome: ${student.name}`, 14, 90);
    doc.text(`Data de Nascimento: ${formatDate(student.birthDate)} (Idade: ${calculateAge(student.birthDate)} anos)`, 14, 95);
    doc.text(`RG: ${student.rg || '-'}`, 14, 100);
    doc.text(`CPF: ${student.cpf || '-'}`, 100, 100);

    // Dados do Plano
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO PLANO CONTRATADO:", 14, 110);
    doc.setFont("helvetica", "normal");
    doc.text(`Plano: ${plan?.name || 'Não definido'}`, 14, 115);
    doc.text(`Valor da Mensalidade: R$ ${plan?.price.toFixed(2) || '0,00'}`, 14, 120);
    doc.text(`Dia do Vencimento: Todo dia ${plan?.dueDay || '10'}`, 100, 120);

    // Cláusulas
    doc.setFont("helvetica", "bold");
    doc.text("TERMOS E CONDIÇÕES:", 14, 130);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    const introText = `Eu, CONTRATANTE, abaixo qualificado, na qualidade de RESPONSÁVEL pelo (ALUNO) acima citado, venho solicitar e formalizar a inscrição, neste TERMO DE CONTRATAÇÃO, na UNIDADE, do ALUNO acima qualificado, declarando e assumindo, nesta oportunidade:`;
    
    const clauses = [
      "1 - Eximir a escola de eventuais acidentes, tais como, lesões, machucados, torções etc., decorrente da prática do futebol. Em caso de ocorrência é dever da escola prestar os primeiros socorros. Em caso de acidente grave fica autorizado o atendimento no posto/hospital publico mais próximo;",
      "2 - Apresentar o ATESTADO MÉDICO em tempo hábil (30 dias), além de declarar que o aluno goza de perfeita saúde, não havendo qualquer impedimento ao se estado de saúde para a prática esportiva;",
      "3 - O Aluno não treinara sem que esteja DEVIDAMENTE UNIFORMIZADO. Portanto, é obrigatório o uso do kit completo, além de chuteiras Society (obs.: É proibido o uso de chuteiras com travas em nosso campo);",
      "4 - Os eventuais problemas de ordem DISCIPLINAR serão resolvidos pela direção da escola e posteriormente comunicados ao responsável pelo aluno.;",
      "5 - Autorizo a utilização da imagem do referido aluno nas mídias sociais do Garotos do Martinica / Martinica Oficial, site e demais ações publicitárias com o intuito de promover o trabalho desenvolvido pela entidade.",
      "6 - Caso o atleta acumule duas ou mais mensalidades em atraso, o mesmo terá o acesso aos treinamentos automaticamente suspenso, permanecendo o bloqueio até a regularização dos débitos pendentes."
    ];

    let currentY = 135;
    const splitIntro = doc.splitTextToSize(introText, 180);
    doc.text(splitIntro, 14, currentY);
    currentY += (splitIntro.length * 5) + 2;

    clauses.forEach(clause => {
      const splitClause = doc.splitTextToSize(clause, 180);
      doc.text(splitClause, 14, currentY);
      currentY += (splitClause.length * 5) + 1.5;
    });

    // Seção de Saúde
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("SEU FILHO POSSUI ALGUM RESTRIÇÃO DE SAUDE: SIM (  ) NÃO (  )", 14, currentY);
    currentY += 6;
    doc.text("SE SIM, QUAL: ____________________________________________________________________", 14, currentY);

    // Footer
    currentY += 20;
    doc.text(`São Paulo, ${today}.`, 14, currentY);
    currentY += 20;
    doc.text("___________________________________________________", 14, currentY);
    currentY += 5;
    doc.text("Assinatura do Responsável", 14, currentY);

    doc.save(`Contrato_Martinica_${student.name.replace(/\s+/g, '_')}.pdf`);
  };

  const handleManualTuitionGen = async () => {
      if (confirm("Deseja gerar as mensalidades ainda não lançadas deste mês para todos os alunos ativos?")) {
          setIsGenerating(true);
          try {
              await onGenerateTuitions();
              alert("Processamento de mensalidades concluído!");
          } catch (error) {
              alert("Erro ao processar mensalidades.");
          } finally {
              setIsGenerating(false);
          }
      }
  };

  const handleBatchSendCharges = async () => {
      const debtors = students.filter(s => {
          if (!s.active) return false;
          const overdue = transactions.filter(t => t.studentId === s.id && t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && t.date < todayStr);
          return overdue.length > 0;
      });

      if (debtors.length === 0) {
          alert("Não há atletas ativos com mensalidades em atraso para notificar.");
          return;
      }

      const confirmMsg = `Deseja enviar lembretes de cobrança via WhatsApp para ${debtors.length} responsáveis?\n\nREGRA DE SEGURANÇA: O sistema enviará 1 mensagem a cada 10 segundos para evitar que seu número seja bloqueado por SPAM.`;
      
      if (!confirm(confirmMsg)) return;

      setIsGenerating(true);
      let successCount = 0;

      // Execução serial com delay de 10s entre cada aluno
      for (let i = 0; i < debtors.length; i++) {
          const student = debtors[i];
          const overdueTxs = transactions.filter(t => t.studentId === student.id && t.type === TransactionType.INCOME && t.status === PaymentStatus.PENDING && t.date < todayStr);
          const totalDebt = overdueTxs.reduce((acc, t) => acc + t.amount, 0);
          const phone = student.guardian.phone.replace(/\D/g, '');

          if (phone) {
              let message = `Olá *${student.guardian.name}*! ⚽ Aqui é da escolinha *Garotos do Martinica*.\n\nIdentificamos as seguintes pendências para o atleta *${student.name}*:\n\n`;
              
              overdueTxs.forEach(t => {
                  message += `• *${t.description}* - R$ ${t.amount.toFixed(2)} (Venc: ${formatDate(t.date)})\n`;
              });
              
              message += `\n*TOTAL: R$ ${totalDebt.toFixed(2)}*\n\n*Pagamento via PIX (Chave Celular):* 11987019721\nNome: CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA\n\nPor favor, realize a regularização via Portal do Aluno ou procure a secretaria para regularizar a situação. Caso já tenha pago, favor desconsiderar.\n\nAgradecemos a confiança e parceria de sempre!`;
              
              const sent = await sendZApiMessage(phone, message);
              if (sent) successCount++;
          }

          // Aguarda 10 segundos antes do próximo, exceto se for o último
          if (i < debtors.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 10000));
          }
      }

      setIsGenerating(false);
      alert(`Processo concluído!\nEnviados com sucesso: ${successCount}\nFalhas/Sem Tel: ${debtors.length - successCount}`);
  };

  const handleExportExcel = () => {
      const currentYear = new Date().getFullYear();
      const data = filteredStudents.map(s => {
          const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear;
          const category = `Sub-${currentYear - birthYear}`;
          const checkDoc = (doc: any) => (typeof doc === 'boolean' ? (doc ? 'Sim' : 'Não') : (doc?.delivered ? 'Sim' : 'Não'));

          return {
              'Nome do Aluno': s.name,
              'Categoria': category,
              'Data de Nascimento': formatDate(s.birthDate),
              'Idade': calculateAge(s.birthDate),
              'RG Aluno': s.rg || '',
              'CPF Aluno': s.cpf || '',
              'Telefone Aluno': s.phone || '',
              'Posições': (s.positions || []).join(', '),
              'Vencimento Atestado': formatDate(s.medicalCertificateExpiry),
              'Responsável': s.guardian.name,
              'CPF Responsável': s.guardian.cpf || '',
              'Telefone Resp.': s.guardian.phone,
              'Email Resp.': s.guardian.email || '',
              'CEP': s.address.cep || '',
              'Rua': s.address.street || '',
              'Número': s.address.number || '',
              'Complemento': s.address.complement || '',
              'Bairro': s.address.district || '',
              'Cidade': s.address.city || '',
              'Estado': s.address.state || '',
              'Plano': plans.find(p => p.id === s.planId)?.name || 'N/A',
              'Grupos': (s.groupIds || []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', '),
              'Status': s.active ? 'Ativo' : 'Inativo',
              'Mensalidades Atrasadas': getStudentOverdueCount(s.id),
              'Doc: RG': checkDoc(s.documents.rg),
              'Doc: CPF': checkDoc(s.documents.cpf),
              'Doc: Atestado': checkDoc(s.documents.medical),
              'Doc: Endereço': checkDoc(s.documents.address),
              'Doc: Escolar': checkDoc(s.documents.school)
          };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Alunos Completo");
      XLSX.writeFile(wb, `Alunos_Martinica_Completo_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(18);
      doc.text("Relatório Geral de Alunos - Garotos do Martinica", 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
      
      const currentYear = new Date().getFullYear();
      const body = filteredStudents.map(s => {
          const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear;
          const category = `Sub-${currentYear - birthYear}`;
          return [
              s.name,
              category,
              calculateAge(s.birthDate),
              (s.positions || []).join(', '),
              s.rg || s.cpf || '-',
              s.guardian.name,
              s.guardian.phone,
              plans.find(p => p.id === s.planId)?.name || '-',
              s.active ? 'Ativo' : 'Inativo',
              getStudentOverdueCount(s.id) > 0 ? `Sim (${getStudentOverdueCount(s.id)})` : 'Não'
          ];
      });

      autoTable(doc, {
          startY: 35,
          head: [['Nome', 'Cat.', 'Idade', 'Posições', 'RG/CPF', 'Responsável', 'Telefone', 'Plano', 'Status', 'Atraso']],
          body: body,
          headStyles: { fillColor: [249, 115, 22] },
          styles: { fontSize: 7, cellPadding: 2 }
      });
      doc.save("Relatorio_Completo_Alunos_Martinica.pdf");
  };

  const handleDownloadTemplate = () => {
      const templateData = [{
          nome: "João Exemplo Silva",
          nascimento: "2012-05-20",
          rg: "00000000",
          cpf: "00000000000",
          telefone_aluno: "11987019721",
          atestado_vencimento: "2024-12-31",
          responsavel_nome: "Maria Responsavel",
          responsavel_cpf: "00000000000",
          responsavel_telefone: "11977776666",
          responsavel_email: "maria@email.com",
          cep: "00000-000",
          rua: "Rua Exemplo",
          bairro: "Bairro Exemplo"
      }];
      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template_Importacao");
      XLSX.writeFile(wb, "Modelo_Importacao_Alunos.xlsx");
  };

  const sendDocReminder = async (student: Student) => {
    const phone = student.guardian.phone.replace(/\D/g, '');
    if (!phone) return alert("Responsável sem telefone cadastrado.");
    const msg = `Olá *${student.guardian.name}*, aqui é da escolinha *Garotos do Martinica*! ⚽\n\nNotamos que o(a) atleta *${student.name}* está com pendências na entrega da documentação obrigatória (RG, CPF, Comprovante de Endereço ou Escolar).\n\nPor favor, entregue o quanto antes na secretaria para regularizar a inscrição. Obrigado!`;
    const sent = await sendZApiMessage(phone, msg);
    if (sent) alert(`Lembrete de documentos enviado para ${student.guardian.name}!`);
    else alert("Erro ao enviar mensagem via Z-API. Verifique as configurações no menu Financeiro.");
  };

  const sendMedicalReminder = async (student: Student) => {
    const phone = student.guardian.phone.replace(/\D/g, '');
    if (!phone) return alert("Responsável sem telefone cadastrado.");
    const date = formatDate(student.medicalCertificateExpiry);
    const msg = `Olá *${student.guardian.name}*, tudo bem? Aqui é da *Garotos do Martinica*! ⚽\n\nIdentificamos que o atestado médico do(a) atleta *${student.name}* venceu em *${date}*. \n\nA renovação do exame médico é fundamental para a segurança e continuidade do aluno nos treinos. Por favor, providencie um novo atestado.\n\nQualquer dúvida, estamos à disposição!`;
    const sent = await sendZApiMessage(phone, msg);
    if (sent) alert(`Aviso de atestado enviado para ${student.guardian.name}!`);
    else alert("Erro ao enviar via Z-API. Verifique as configurações no menu Financeiro.");
  };

  const handlePayTransaction = (id: string, method: PaymentMethod) => {
      // Incluímos paymentDate para garantir que o trigger de WhatsApp receba a data correta
      onUpdateTransaction({ 
          id, 
          status: PaymentStatus.PAID, 
          paymentMethod: method, 
          paymentDate: new Date().toISOString().split('T')[0] 
      });
  };

  const handleCancelTransaction = (tx: Transaction) => {
      if (confirm(`Deseja realmente cancelar/ignorar a cobrança: ${tx.description}?`)) {
          onUpdateTransaction({ id: tx.id, status: PaymentStatus.CANCELLED });
      }
  };

  const initialFormState: any = {
    name: '', birthDate: '', rg: '', cpf: '', phone: '', medicalCertificateExpiry: '', groupIds: [], planId: '', active: true, positions: [],
    address: { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
    guardian: { name: '', phone: '', email: '', cpf: '' },
    documents: { rg: { delivered: false, isDigital: false }, cpf: { delivered: false, isDigital: false }, medical: { delivered: false, isDigital: false }, address: { delivered: false, isDigital: false }, school: { delivered: false, isDigital: false } }
  };

  const [studentForm, setStudentForm] = useState(initialFormState);

  const sendChargeMessage = async (tx: Transaction) => {
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone) { alert("Telefone indisponível."); return; }
      
      const cleanCpf = studentForm.guardian.cpf?.replace(/\D/g, '');
      if (!cleanCpf || cleanCpf.length < 11) {
          alert("Erro: O CPF do responsável é necessário para gerar o link de pagamento do Mercado Pago. Por favor, complete o cadastro.");
          return;
      }

      let finalPaymentLink = tx.paymentLink;

      // Gera um link de pagamento em tempo real caso não exista
      if (!finalPaymentLink) {
          try {
              const preference = await createMPPreference({
                  title: tx.description,
                  price: tx.amount,
                  externalReference: tx.externalReference || crypto.randomUUID(),
                  payer: {
                      name: studentForm.guardian.name,
                      email: studentForm.guardian.email || 'financeiro@martinica.com',
                      phone: studentForm.guardian.phone,
                      identification: { type: 'CPF', number: cleanCpf }
                  }
              });

              if (preference) {
                  finalPaymentLink = preference.init_point;
                  onUpdateTransaction({
                      id: tx.id,
                      paymentLink: finalPaymentLink,
                      preferenceId: preference.id
                  });
              }
          } catch (e) {
              console.error("Erro ao gerar link MP:", e);
          }
      }

      let message = `Olá *${studentForm.guardian.name}*, somos da *Garotos do Martinica*. ⚽\n\nConstatamos a pendência: *${tx.description}*\nVencimento: ${formatDate(tx.date)}\nValor: *R$ ${tx.amount.toFixed(2)}*`;
      
      message += `\n\n*Pagamento via PIX (Chave Celular):* 11987019721\nNome: CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA`;

      if (finalPaymentLink) {
          message += `\n\nOu, se preferir, pague via Cartão clicando no link abaixo:\n${finalPaymentLink}`;
      } else {
          message += `\n\n(Aviso: No momento, pagamentos via cartão/link estão instáveis. Por favor, utilize a chave PIX acima)`;
      }
      
      message += `\n\nObrigado!`;
      
      const sent = await sendZApiMessage(phone, message);
      if (sent) alert("Cobrança enviada com sucesso!"); else alert("Erro ao enviar via Z-API. Verifique as configurações.");
  };

  const sendBatchSelectedCharges = async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (selectedFinanceIds.size === 0) return;
      
      const phone = studentForm.guardian.phone.replace(/\D/g, '');
      if (!phone) { alert("Responsável sem telefone cadastrado."); return; }

      const selectedTxs = studentTransactions.filter(t => selectedFinanceIds.has(t.id));
      const totalAmount = selectedTxs.reduce((acc, t) => acc + t.amount, 0);
      
      let message = `Olá *${studentForm.guardian.name}*! ⚽ Aqui é da *Garotos do Martinica*.\n\nIdentificamos pendências para o atleta *${studentForm.name}*:\n\n`;
      
      selectedTxs.forEach(t => {
          message += `• *${t.description}* - R$ ${t.amount.toFixed(2)} (Venc: ${formatDate(t.date)})\n`;
      });
      
      message += `\n*TOTAL: R$ ${totalAmount.toFixed(2)}*\n\n*Pagamento via PIX (Chave Celular):* 11987019721\nNome: CLUBE DESPORTIVO MUNICIPAL JARDIM MARTINICA\n\nPor favor, realize a regularização via Portal do Aluno ou procure a secretaria. Caso já tenha pago, favor desconsiderar.`;
      
      const sent = await sendZApiMessage(phone, message);
      if (sent) alert(`${selectedTxs.length} cobrança(s) enviada(s) com sucesso!`);
      else alert("Erro ao enviar mensagens via Z-API.");
  };

  const availableCategories = useMemo(() => {
    const cats = new Set<string>(); const currentYear = new Date().getFullYear();
    students.forEach(s => { const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : currentYear; cats.add(`Sub-${currentYear - birthYear}`); });
    return Array.from(cats).sort((a, b) => parseInt(a.replace('Sub-', '')) - parseInt(b.replace('Sub-', '')));
  }, [students]);

  const toggleCategory = (cat: string) => { setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]); };

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const ms = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.guardian.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      let mage = true;
      if (ageFilter) {
          mage = calculateAge(s.birthDate).toString() === ageFilter;
      }

      let mpos = true;
      if (positionFilter !== 'ALL') {
          mpos = (s.positions || []).includes(positionFilter);
      }

      let mc = true; 
      if (selectedCategories.length > 0) { 
          const birthYear = s.birthDate ? parseInt(s.birthDate.split('-')[0]) : new Date().getFullYear(); 
          mc = selectedCategories.includes(`Sub-${ new Date().getFullYear() - birthYear}`); 
      }

      let mstat = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? s.active : !s.active);
      let mmed = medicalFilter === 'ALL' || (medicalFilter === 'VALID' ? !isMedicalExpired(s.medicalCertificateExpiry) : isMedicalExpired(s.medicalCertificateExpiry));
      let mfin = financeFilter === 'ALL' || (financeFilter === 'DEFAULTING' ? getStudentOverdueCount(s.id) > 0 : getStudentOverdueCount(s.id) === 0);
      let mfinOk = financeFilter === 'ALL' || (financeFilter === 'OK' ? getStudentOverdueCount(s.id) === 0 : true);
      let mdoc = docsFilter === 'ALL' || (docsFilter === 'MISSING_DOCS' ? hasMissingDocs(s) : !hasMissingDocs(s));
      let mplan = planFilter === 'ALL' || s.planId === planFilter;

      return ms && mage && mpos && mc && mstat && mmed && mfin && mfinOk && mdoc && mplan;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, searchTerm, ageFilter, positionFilter, selectedCategories, statusFilter, medicalFilter, financeFilter, docsFilter, planFilter]);

  const startCamera = async () => {
    setIsCameraOpen(true);
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); if (videoRef.current) videoRef.current.srcObject = stream; } 
    catch (error) { alert("Sem acesso à câmera."); setIsCameraOpen(false); }
  };

  const stopCamera = () => { 
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false); 
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) { 
        context.drawImage(videoRef.current, 0, 0, 300, 300); 
        setCapturedImage(canvasRef.current.toDataURL('image/jpeg')); 
        stopCamera(); 
      }
    }
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenNew = () => { setEditingId(null); setStudentForm({ ...initialFormState, groupIds: [], positions: [] }); setCapturedImage(null); setActiveTab('DETAILS'); setSelectedFinanceIds(new Set()); setIsModalOpen(true); };

  const handleOpenEdit = (student: Student) => {
      setEditingId(student.id);
      const normalizeDocs = (docs: any) => {
          if (!docs) return initialFormState.documents;
          const newDocs: any = {};
          ['rg', 'cpf', 'medical', 'address', 'school'].forEach(k => { const v = docs[k]; newDocs[k] = typeof v === 'boolean' ? { delivered: v, isDigital: false } : v || { delivered: false, isDigital: false }; });
          return newDocs;
      };
      setStudentForm({ 
          ...student, 
          groupIds: Array.isArray(student.groupIds) ? student.groupIds : [], 
          positions: Array.isArray(student.positions) ? student.positions : [],
          documents: normalizeDocs(student.documents) 
      });
      setCapturedImage(student.photoUrl || null); setActiveTab('DETAILS'); setSelectedFinanceIds(new Set()); setIsModalOpen(true);
  };

  const handleOpenHistory = (student: Student) => { handleOpenEdit(student); setActiveTab('FINANCE'); };
  const handleOpenAttendance = (student: Student) => { handleOpenEdit(student); setActiveTab('ATTENDANCE'); };
  const handleOpenOccurrences = (student: Student) => { handleOpenEdit(student); setActiveTab('OCCURRENCES'); };

  const handleOpenAddOccurrence = (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    setNewOccurrence({ description: '', date: new Date().toISOString().split('T')[0], studentId: student.id });
    setShowOccurrenceModal(true);
  };

  const handleSaveOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newOccurrence.description && newOccurrence.studentId) {
        const ok = await onAddOccurrence(newOccurrence.studentId, newOccurrence.description, newOccurrence.date);
        if (ok) {
            alert("Ocorrência registrada e enviada!");
            setShowOccurrenceModal(false);
        } else {
            alert("Erro ao salvar ocorrência.");
        }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if(isGuardian) return; 
    const studentData = { ...studentForm, photoUrl: capturedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentForm.name)}&background=random&color=fff&size=200` };
    if (editingId) onUpdateStudent({ ...studentData, id: editingId } as Student);
    else onAddStudent(studentData);
    setIsModalOpen(false); setCapturedImage(null); setEditingId(null); setStudentForm(initialFormState); setSelectedFinanceIds(new Set());
  };

  const handleSaveManualCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCharge.description && manualCharge.amount > 0 && editingId) {
      if (editingChargeId) {
        onUpdateTransaction({ 
          id: editingChargeId, 
          description: manualCharge.description, 
          amount: manualCharge.amount, 
          date: manualCharge.date 
        });
      } else {
        onAddTransaction({ ...manualCharge, type: TransactionType.INCOME, status: PaymentStatus.PENDING, studentId: editingId, paymentMethod: PaymentMethod.CASH });
      }
      setShowChargeModal(false); 
      setEditingChargeId(null);
      setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] });
    }
  };

  const handleOpenEditCharge = (e: React.MouseEvent, tx: Transaction) => {
      e.stopPropagation();
      setEditingChargeId(tx.id);
      setManualCharge({ 
          description: tx.description, 
          amount: tx.amount, 
          date: tx.date 
      });
      setShowChargeModal(true);
  };

  const toggleFinanceSelection = (id: string) => {
      const next = new Set(selectedFinanceIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedFinanceIds(next);
  };

  const initiatePixPayment = async (txId?: string) => {
      let amount = 0; let description = ''; let externalRef = ''; const idsToPay: string[] = [];
      if (txId) { const tx = transactions.find(t => t.id === txId); if (!tx) return; amount = tx.amount; description = tx.description; externalRef = tx.externalReference || crypto.randomUUID(); idsToPay.push(txId); } 
      else if (selectedFinanceIds.size > 0) { const sel = transactions.filter(t => selectedFinanceIds.has(t.id)); amount = sel.reduce((a, t) => a + t.amount, 0); description = `Combo ${sel.length} mensalidades`; externalRef = `combo_${Date.now()}`; sel.forEach(t => idsToPay.push(t.id)); } 
      else return;
      
      const cleanedCpf = (studentForm.guardian.cpf || '').replace(/\D/g, '');
      if (cleanedCpf.length !== 11) { 
          alert("CPF inválido ou não informado para o responsável. A geração do PIX exige um CPF válido com 11 dígitos nas configurações do atleta."); 
          return; 
      }
      
      setPixLoading(true); setShowPixModal(true); setPixData(null); setPixTxIds(idsToPay);
      
      try {
          const result = await createPixPayment({ 
              title: description, 
              price: amount, 
              externalReference: externalRef, 
              payer: { 
                  name: studentForm.guardian.name, 
                  email: studentForm.guardian.email, 
                  phone: studentForm.guardian.phone, 
                  identification: { type: 'CPF', number: cleanedCpf } 
              } 
          });
          
          if (result) { 
              setPixData(result); 
              for (const id of idsToPay) {
                  onUpdateTransaction({ id, externalReference: externalRef });
              }
          } 
          else { 
              alert("Erro ao gerar QR Code. Certifique-se de que o CPF do responsável está correto e o Access Token nas configurações financeiras é válido."); 
              setShowPixModal(false); 
          }
      } catch (error) { 
          alert("Erro de comunicação com Mercado Pago."); 
          setShowPixModal(false); 
      } finally { 
          setPixLoading(false); 
      }
  };
  
  const confirmPixPaymentSuccess = () => { setSelectedFinanceIds(new Set()); setShowPixModal(false); setPixData(null); setPixTxIds([]); };
  const copyPixCode = () => { if (pixData?.qrCode) { navigator.clipboard.writeText(pixData.qrCode); alert("Código PIX Copiado!"); } };

  const studentTransactions = transactions.filter(t => t.studentId === editingId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const selectedTotal = studentTransactions.filter(t => selectedFinanceIds.has(t.id)).reduce((acc, t) => acc + t.amount, 0);

  const studentActivities = activities.filter(a => editingId && (a.groupId && (studentForm.groupIds || []).includes(a.groupId) || a.participants?.includes(editingId) || a.attendance?.includes(editingId))).sort((a, b) => new Date(b.date + 'T' + b.startTime).getTime() - new Date(a.date).getTime());

  // Atividades filtradas por mês, ano e que já aconteceram (histórico)
  const filteredStudentActivities = useMemo(() => {
    return studentActivities.filter(act => {
      const actDate = act.date; // YYYY-MM-DD
      const d = new Date(act.date + 'T00:00:00');
      
      const matchesMonth = attendanceMonth === -1 || d.getMonth() === attendanceMonth;
      const matchesYear = d.getFullYear() === attendanceYear;
      const isPast = actDate <= todayStr;
      
      return matchesMonth && matchesYear && isPast;
    });
  }, [studentActivities, attendanceMonth, attendanceYear, todayStr]);

  const studentOccurrences = useMemo(() => {
      return occurrences.filter(o => o.studentId === editingId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [occurrences, editingId]);

  const updateDoc = (field: string, sub: 'delivered' | 'isDigital', val: boolean) => {
      setStudentForm((prev: any) => { const d = (prev.documents as any)[field] || { delivered: false, isDigital: false }; return { ...prev, documents: { ...prev.documents, [field]: { ...d, [sub]: val } } }; });
  };

  const toggleGroupSelection = (gid: string) => {
      setStudentForm((prev: any) => { const g = prev.groupIds || []; return { ...prev, groupIds: g.includes(gid) ? g.filter((id: any) => id !== gid) : [...g, gid] }; });
  };

  const togglePositionSelection = (pos: string) => {
      setStudentForm((prev: any) => { 
          const currentPositions = prev.positions || [];
          return { 
              ...prev, 
              positions: currentPositions.includes(pos) 
                ? currentPositions.filter((p: any) => p !== pos) 
                : [...currentPositions, pos] 
          }; 
      });
  };

  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, ''); if (cleanCep.length !== 8) return;
    setIsLoadingCep(true);
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) setStudentForm((prev: any) => ({ ...prev, address: { ...prev.address, street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf, cep: cep } }));
        else alert('CEP não encontrado.');
    } catch (error) { alert('Erro ao buscar CEP.'); } finally { setIsLoadingCep(false); }
  };

  const monthsList = [
    { value: 0, label: 'Janeiro' }, { value: 1, label: 'Fevereiro' }, { value: 2, label: 'Março' },
    { value: 3, label: 'Abril' }, { value: 4, label: 'Maio' }, { value: 5, label: 'Junho' },
    { value: 6, label: 'Julho' }, { value: 7, label: 'Agosto' }, { value: 8, label: 'Setembro' },
    { value: 9, label: 'Outubro' }, { value: 10, label: 'Novembro' }, { value: 11, label: 'Dezembro' }
  ];

  const currentYear = new Date().getFullYear();
  const yearsList = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const handleSendAttendanceReport = async () => {
      const student = students.find(s => s.id === editingId);
      if (!student || !student.guardian.phone) return alert("Responsável sem telefone cadastrado.");

      const monthName = monthsList.find(m => m.value === attendanceMonth)?.label || "Todos";
      const presences = filteredStudentActivities.filter(a => (a.attendance || []).includes(editingId!)).length;
      const absences = filteredStudentActivities.filter(a => !(a.attendance || []).includes(editingId!) && a.date <= todayStr).length;
      const goals = filteredStudentActivities.reduce((acc, a) => acc + (a.scorers?.filter(s => s === editingId).length || 0), 0);

      let message = `⚽ *Relatório de Presença - Garotos do Martinica*\n\n`;
      message += `Atleta: *${student.name}*\n`;
      message += `Período: ${monthName} / ${attendanceYear}\n\n`;
      message += `✅ Presenças: *${presences}*\n`;
      message += `❌ Faltas: *${absences}*\n`;
      message += `🔥 Gols Marcados: *${goals}*\n\n`;
      message += `*Histórico Recente:*`;

      // Pega as últimas 5 atividades para não estourar limite ou ficar muito longa
      filteredStudentActivities.slice(0, 8).forEach(act => {
          const isPresent = (act.attendance || []).includes(editingId!);
          message += `\n• ${formatDate(act.date)}: ${act.title} (${isPresent ? '✅' : '❌'})`;
      });

      if (filteredStudentActivities.length > 8) {
          message += `\n... entre outras.`;
      }

      message += `\n\nAcompanhe o desempenho completo pelo Portal do Aluno!`;

      const sent = await sendZApiMessage(student.guardian.phone, message);
      if (sent) alert("Relatório enviado com sucesso via WhatsApp!");
      else alert("Erro ao enviar via Z-API. Verifique as configurações no menu Financeiro.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isGuardian ? 'Meus Filhos' : 'Alunos e Responsáveis'}</h2>
        {!isGuardian && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full md:w-auto">
                <button onClick={handleManualTuitionGen} disabled={isGenerating} className="justify-center flex items-center gap-2 bg-gray-700 text-white px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-sm text-xs sm:text-sm disabled:opacity-50">
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
                    <span>Mensalidades</span>
                </button>
                <button onClick={handleBatchSendCharges} disabled={isGenerating} className="justify-center flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors shadow-sm text-xs sm:text-sm disabled:opacity-50">
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>Cobrar</span>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="justify-center flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-xs sm:text-sm"><Upload className="w-4 h-4" /><span>Importar</span></button>
                <button onClick={handleDownloadTemplate} className="justify-center flex items-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-sm text-xs sm:text-sm"><FileSpreadsheet className="w-4 h-4" /><span>Modelo</span></button>
                <button onClick={handleExportExcel} className="justify-center flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-sm text-xs sm:text-sm"><Download className="w-4 h-4" /><span>Excel</span></button>
                <button onClick={handleExportPDF} className="justify-center flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-sm text-xs sm:text-sm"><FileText className="w-4 h-4" /><span>PDF</span></button>
                <button onClick={handleOpenNew} className="col-span-2 justify-center flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm text-xs sm:text-sm"><Plus className="w-4 h-4" /><span>Novo Aluno</span></button>
            </div>
        )}
      </div>

      {!isGuardian && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-3 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input type="text" placeholder="Buscar atleta ou responsável..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="lg:col-span-1 relative">
                    <input type="number" placeholder="Idade" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow" value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} />
                </div>
                <div className="lg:col-span-2 relative">
                    <Target className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
                        <option value="ALL">Posição: Todas</option>
                        {positionsList.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                    </select>
                </div>
                <div className="lg:col-span-2 relative" ref={categoryDropdownRef}>
                    <div className="w-full pl-3 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-gray-600 text-sm cursor-pointer flex items-center justify-between hover:border-primary-300 transition-colors" onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}>
                        <div className="flex items-center gap-2 overflow-hidden truncate">
                            <Layers className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{selectedCategories.length > 0 ? `${selectedCategories.length} Sel.` : 'Categorias'}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isCategoryDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto p-1 animate-in fade-in zoom-in-95 duration-100">
                            <div className="p-2 text-xs text-gray-400 font-medium uppercase tracking-wider border-b border-gray-50 mb-1">Categorias</div>
                            {availableCategories.map(cat => (
                                <label key={cat} className="flex items-center gap-2 p-2 hover:bg-primary-50 rounded-md cursor-pointer text-sm transition-colors">
                                    <input type="checkbox" checked={selectedCategories.includes(cat)} onChange={() => toggleCategory(cat)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-4 h-4" />
                                    <span>{cat}</span>
                                </label>
                            ))}
                            {selectedCategories.length > 0 && (
                                <button onClick={() => { setSelectedCategories([]); setIsCategoryDropdownOpen(false); }} className="w-full text-center text-xs text-red-500 hover:bg-red-50 p-2 rounded mt-1 border-t border-gray-50">Limpar</button>
                            )}
                        </div>
                    )}
                </div>
                <div className="lg:col-span-2 relative">
                    <Ticket className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                        <option value="ALL">Plano: Todos</option>
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="lg:col-span-2 relative">
                    <ShieldCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ALL">Status: Todos</option>
                        <option value="ACTIVE">Ativos</option>
                        <option value="INACTIVE">Inativos</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-3 relative">
                    <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={financeFilter} onChange={(e) => setFinanceFilter(e.target.value)}>
                        <option value="ALL">Financeiro: Todos</option>
                        <option value="DEFAULTING">Inadimplentes</option>
                        <option value="OK">Em dia</option>
                    </select>
                </div>
                <div className="lg:col-span-2 relative">
                    <FolderCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select className="w-full pl-9 pr-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={docsFilter} onChange={(e) => setDocsFilter(e.target.value)}>
                        <option value="ALL">Docs: Todos</option>
                        <option value="MISSING_DOCS">Docs: Pendentes</option>
                        <option value="OK">Docs: OK</option>
                    </select>
                </div>
                <div className="lg:col-span-2 relative">
                    <HeartPulse className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select className="w-full pl-9 pr-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white text-gray-600 text-sm" value={medicalFilter} onChange={(e) => setMedicalFilter(e.target.value)}>
                        <option value="ALL">Médico: Todos</option>
                        <option value="VALID">Atestado OK</option>
                        <option value="EXPIRED">Vencido</option>
                    </select>
                </div>
            </div>
        </div>
      )}

      {/* VISUALIZAÇÃO MOBILE/TABLET EM CARDS (Até LG - 1024px) */}
      <div className="lg:hidden space-y-4">
          {filteredStudents.map((student) => {
              const overdueCount = getStudentOverdueCount(student.id);
              const currentYear = new Date().getFullYear(); 
              const birthYear = student.birthDate ? parseInt(student.birthDate.split('-')[0]) : currentYear;
              const groupNames = (student.groupIds || []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') || 'Sem Grupo';
              
              // Definir cores conforme o número de mensalidades atrasadas
              const overdueBorderClass = overdueCount >= 3 
                  ? 'border-red-500 bg-red-50/50' 
                  : overdueCount === 2 
                  ? 'border-orange-500 bg-orange-50/50' 
                  : overdueCount === 1 
                  ? 'border-red-200 bg-red-50/20' 
                  : 'border-gray-100';

              const overdueBadgeClass = overdueCount >= 3
                  ? 'bg-red-600 text-white'
                  : overdueCount === 2
                  ? 'bg-orange-500 text-white'
                  : 'bg-red-100 text-red-700';
              
              return (
                  <div key={student.id} className={`bg-white p-4 rounded-xl shadow-sm border transition-all ${overdueBorderClass}`}>
                      <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3">
                              <img src={student.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover bg-gray-200 border-2 border-white shadow-sm" />
                              <div>
                                  <h4 className="font-bold text-gray-900 text-base leading-tight">{student.name}</h4>
                                  <span className="text-xs text-gray-500 font-medium">Sub-{currentYear - birthYear} • {calculateAge(student.birthDate)} anos</span>
                              </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase border ${student.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                              {student.active ? 'Ativo' : 'Inat.'}
                          </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 mb-4">
                          <div className="flex items-center gap-2 text-xs">
                              <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-600 font-bold">{student.guardian.name}</span>
                              {student.guardian.phone && (
                                  <a href={`https://wa.me/55${student.guardian.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="bg-green-50 text-white p-1 rounded-md ml-auto">
                                      <MessageCircle className="w-3 h-3 text-green-600" />
                                  </a>
                              )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                              <Target className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-500 truncate">{(student.positions || []).join(', ') || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                              <Layers className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-500 truncate">{groupNames}</span>
                          </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4 border-t border-gray-50 pt-3">
                          {overdueCount > 0 && (
                              <span className={`${overdueBadgeClass} text-[10px] px-2 py-1 rounded-lg font-black border border-black/5 flex items-center gap-1 animate-pulse`}>
                                  <AlertTriangle className="w-3 h-3" /> {overdueCount} MENSALIDADES ATRASADAS
                              </span>
                          )}
                          {hasMissingDocs(student) && !isGuardian && (
                              <button onClick={() => sendDocReminder(student)} className="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded-lg font-black border border-orange-200 flex items-center gap-1">
                                  <FileWarning className="w-3 h-3" /> DOCS PENDENTES
                              </button>
                          )}
                          {isMedicalExpired(student.medicalCertificateExpiry) && !isGuardian && (
                              <button onClick={() => sendMedicalReminder(student)} className="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded-lg font-black border border-orange-200 flex items-center gap-1">
                                  <HeartPulse className="w-3 h-3" /> ATESTADO VENCIDO
                              </button>
                          )}
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                          <button onClick={() => handleGenerateContract(student)} className="flex-shrink-0 flex items-center justify-center gap-2 bg-gray-50 text-gray-700 p-2 rounded-lg text-xs font-bold border border-gray-200"><Printer className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleOpenAttendance(student)} className="flex-shrink-0 flex items-center justify-center gap-2 bg-purple-50 text-purple-700 p-2 rounded-lg text-xs font-bold border border-purple-100"><CalendarCheck className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleOpenHistory(student)} className={`flex-shrink-0 flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-bold border ${overdueCount > 0 ? 'bg-gray-800 text-white' : 'bg-blue-50 text-blue-700 border-blue-100'}`}><History className="w-3.5 h-3.5" /></button>
                          {!isGuardian && <button onClick={(e) => handleOpenAddOccurrence(e, student)} className="flex-shrink-0 flex items-center justify-center gap-2 bg-orange-50 text-orange-700 p-2 rounded-lg text-xs font-bold border border-orange-100"><MessageSquareWarning className="w-3.5 h-3.5" /></button>}
                          <button onClick={() => handleOpenEdit(student)} className="flex-shrink-0 flex items-center justify-center gap-2 bg-gray-50 text-gray-700 p-2 rounded-lg text-xs font-bold border border-gray-200"><Edit className="w-3.5 h-3.5" /></button>
                      </div>
                  </div>
              );
          })}
          {filteredStudents.length === 0 && (
              <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-dashed"><Calculator className="w-10 h-10 mx-auto mb-2 opacity-20" /><p>Nenhum atleta encontrado.</p></div>
          )}
      </div>

      {/* VISUALIZAÇÃO DESKTOP (Somente em telas grandes LG+ - 1024px) */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="overflow-x-auto min-w-0">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aluno</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Posição</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Grupos</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsável</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStudents.map((student) => {
                const groupNames = (student.groupIds || []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ') || 'Sem Grupo';
                const overdueCount = getStudentOverdueCount(student.id);
                const currentYear = new Date().getFullYear(); const birthYear = student.birthDate ? parseInt(student.birthDate.split('-')[0]) : currentYear;
                
                // Definir cor da linha conforme número de atrasos
                const rowBgClass = overdueCount >= 3 
                    ? 'bg-red-50 hover:bg-red-100/80' 
                    : overdueCount === 2 
                    ? 'bg-orange-50 hover:bg-orange-100/80' 
                    : overdueCount === 1 
                    ? 'bg-red-50/30 hover:bg-red-50/60' 
                    : 'hover:bg-gray-50';

                const overdueBadgeClass = overdueCount >= 3
                    ? 'bg-red-600 text-white'
                    : overdueCount === 2
                    ? 'bg-orange-500 text-white'
                    : 'bg-red-100 text-red-600 border-red-200';

                return (
                  <tr key={student.id} className={`transition-colors ${rowBgClass}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={student.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-200" />
                        <div>
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                              {student.name}
                              {overdueCount > 0 && (<span className={`${overdueBadgeClass} text-[10px] px-1.5 py-0.5 rounded-full font-bold border flex items-center gap-1 shadow-sm`}><AlertTriangle className="w-3 h-3" /> {overdueCount} Pend.</span>)}
                              {hasMissingDocs(student) && !isGuardian && (
                                <button 
                                  onClick={() => sendDocReminder(student)}
                                  className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-orange-200 hover:bg-orange-200 transition-colors flex items-center gap-1"
                                >
                                  <FileWarning className="w-3 h-3" /> DOC
                                </button>
                              )}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1.5">
                              <span>Tel: {student.phone}</span>
                              {student.phone && (
                                <a 
                                  href={`https://wa.me/55${student.phone.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-green-500 hover:text-green-600 transition-colors p-0.5 hover:bg-green-50 rounded"
                                  title="Chamar Aluno no WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-bold border">Sub-{currentYear - birthYear}</span></td>
                    <td className="px-6 py-4"><span className="text-sm text-gray-600">{(student.positions || []).slice(0, 2).join(', ') || '-'}</span></td>
                    <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-[200px]" title={groupNames}>{groupNames}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{student.guardian.name}</span>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                            <span>{student.guardian.phone}</span>
                            {student.guardian.phone && (
                                <a 
                                  href={`https://wa.me/55${student.guardian.phone.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-green-500 hover:text-green-600 transition-colors p-0.5 hover:bg-green-50 rounded"
                                  title="Chamar Responsável no WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                          <span className={`w-fit px-3 py-1 rounded-full text-xs font-medium border ${student.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{student.active ? 'Ativo' : 'Inativo'}</span>
                          {isMedicalExpired(student.medicalCertificateExpiry) && !isGuardian && (
                            <button 
                              onClick={() => sendMedicalReminder(student)}
                              className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[10px] font-bold flex items-center gap-1 hover:bg-orange-200 transition-colors"
                            >
                              <HeartPulse className="w-3 h-3" /> Atestado Vencido
                            </button>
                          )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleGenerateContract(student)} className="text-gray-600 hover:text-gray-800 p-2 bg-gray-50 rounded-lg" title="Imprimir Contrato"><Printer className="w-4 h-4" /></button>
                        <button onClick={() => handleOpenAttendance(student)} className="text-purple-600 hover:text-purple-800 transition-colors p-2 bg-purple-50 rounded-lg" title="Frequência"><CalendarCheck className="w-4 h-4" /></button>
                        <button onClick={() => handleOpenHistory(student)} className={`p-2 rounded-lg transition-colors ${overdueCount > 0 ? 'bg-gray-800 text-white shadow-md' : 'bg-blue-50 text-blue-600'}`} title="Financeiro"><History className="w-4 h-4" /></button>
                        {!isGuardian && <button onClick={(e) => handleOpenAddOccurrence(e, student)} className="text-orange-600 hover:text-orange-800 p-2 bg-orange-50 rounded-lg transition-colors" title="Enviar Ocorrência"><MessageSquareWarning className="w-4 h-4" /></button>}
                        <button onClick={() => handleOpenEdit(student)} className="text-primary-600 hover:text-primary-800 p-2 bg-primary-50 rounded-lg" title="Editar"><Edit className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col animate-in zoom-in duration-200">
             <div className="p-4 md:p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
              <div>
                  <h3 className="text-lg md:text-xl font-bold">{isGuardian ? 'Ficha do Atleta' : (editingId ? 'Editar Aluno' : 'Novo Aluno')}</h3>
                  {editingId && (
                      <div className="flex gap-4 mt-4 overflow-x-auto pb-1">
                          <button onClick={() => setActiveTab('DETAILS')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'DETAILS' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Dados</button>
                          <button onClick={() => setActiveTab('FINANCE')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'FINANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Financeiro</button>
                          <button onClick={() => setActiveTab('ATTENDANCE')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ATTENDANCE' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Frequência</button>
                          <button onClick={() => setActiveTab('OCCURRENCES')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'OCCURRENCES' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Ocorrências</button>
                      </div>
                  )}
              </div>
              <div className="flex items-center gap-3">
                  {editingId && !isGuardian && (
                      <button 
                          onClick={(e) => handleOpenAddOccurrence(e, students.find(s => s.id === editingId)!)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 border border-orange-200 rounded-lg text-xs font-bold text-orange-700 hover:bg-orange-200 transition-colors shadow-sm"
                      >
                          <MessageSquareWarning className="w-4 h-4" />
                          <span className="hidden sm:inline">Nova Ocorrência</span>
                      </button>
                  )}
                  <button onClick={() => { setIsModalOpen(false); stopCamera(); }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
            </div>
            
            {activeTab === 'DETAILS' ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <form id="student-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold border-b pb-2">Foto</h4>
                            <div className="flex flex-col items-center gap-4">
                                {/* Hidden canvas for photo capture */}
                                <canvas ref={canvasRef} className="hidden" width="300" height="300"></canvas>
                                {/* Hidden input for file upload */}
                                <input type="file" ref={photoUploadRef} className="hidden" accept="image/*" onChange={handlePhotoFileChange} />
                                
                                {isCameraOpen ? (
                                    <div className="relative w-40 h-40 bg-black rounded-lg overflow-hidden">
                                        <video 
                                          ref={videoRef} 
                                          autoPlay 
                                          playsInline 
                                          muted 
                                          className="w-full h-full object-cover" 
                                        />
                                        <button type="button" onClick={capturePhoto} className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white rounded-full p-2">
                                          <div className="w-4 h-4 bg-red-600 rounded-full" />
                                        </button>
                                    </div>
                                ) : capturedImage ? (
                                    <div className="relative w-32 h-32 md:w-40 md:h-40"><img src={capturedImage} className="w-full h-full object-cover rounded-xl border-2 border-primary-500" />{!isGuardian && <button type="button" onClick={() => setCapturedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md">✕</button>}</div>
                                ) : (
                                    <div className="w-32 h-32 md:w-40 md:h-40 bg-gray-100 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 text-gray-400 gap-2"><UserIcon className="w-10 h-10" /><span>Sem foto</span></div>
                                )}
                                {!isGuardian && !isCameraOpen && (
                                  <div className="flex flex-wrap justify-center gap-2">
                                    <button type="button" onClick={startCamera} className="flex items-center gap-2 text-xs text-primary-600 font-bold hover:bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-200 transition-colors"><Camera className="w-4 h-4" /> Tirar Foto</button>
                                    <button type="button" onClick={() => photoUploadRef.current?.click()} className="flex items-center gap-2 text-xs text-gray-600 font-bold hover:bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"><Upload className="w-4 h-4" /> Escolher Foto</button>
                                  </div>
                                )}
                                {isCameraOpen && <button type="button" onClick={stopCamera} className="text-sm text-red-600 font-bold">Cancelar Câmera</button>}
                            </div>

                            <div className="space-y-3 pt-4">
                                <h4 className="text-sm font-bold border-b pb-2 flex items-center gap-2"><Lock className="w-4 h-4" /> Acesso e Plano</h4>
                                <div><label className="block text-xs font-medium text-gray-500 mb-1">Status do Aluno</label><select className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.active ? 'true' : 'false'} onChange={e => setStudentForm({...studentForm, active: e.target.value === 'true'})} disabled={isGuardian}><option value="true">Ativo</option><option value="false">Inativo / Trancado</option></select></div>
                                <div><label className="block text-xs font-medium text-gray-500 mb-1">Plano de Mensalidade</label><select className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-primary-500 outline-none" required value={studentForm.planId} onChange={e => setStudentForm({...studentForm, planId: e.target.value})} disabled={isGuardian}><option value="">Selecione um plano...</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)}</option>)}</select></div>
                                <div><label className="block text-xs font-medium text-gray-500 mb-1">Grupos / Categorias</label><div className="border rounded-lg p-2 max-h-32 overflow-y-auto bg-white">{groups.map(g => (<label key={g.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer"><input type="checkbox" checked={(studentForm.groupIds || []).includes(g.id)} onChange={() => toggleGroupSelection(g.id)} className="rounded text-primary-600" disabled={isGuardian} /><span className="text-sm">{g.name}</span></label>))}</div></div>
                            </div>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold border-b pb-2 flex items-center gap-2"><UserIcon className="w-4 h-4 text-blue-500" /> Dados do Atleta</h4>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div><label className="block text-xs font-medium text-gray-500 mb-1">Nome Completo</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" required value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} disabled={isGuardian} /></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-medium text-gray-500 mb-1">Nascimento</label><input type="date" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" required value={studentForm.birthDate} onChange={e => setStudentForm({...studentForm, birthDate: e.target.value})} disabled={isGuardian} /></div>
                                            <div><label className="block text-xs font-medium text-gray-500 mb-1">Telefone Aluno</label><input type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="(00) 00000-0000" value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} disabled={isGuardian} /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-medium text-gray-500 mb-1">RG</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.rg} onChange={e => setStudentForm({...studentForm, rg: e.target.value})} disabled={isGuardian} /></div>
                                            <div><label className="block text-xs font-medium text-gray-500 mb-1">CPF</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.cpf} onChange={e => setStudentForm({...studentForm, cpf: e.target.value})} disabled={isGuardian} /></div>
                                        </div>
                                        <div><label className="block text-xs font-medium text-gray-500 mb-1">Vencimento Atestado Médico</label><input type="date" className={`w-full border rounded-lg p-2.5 focus:ring-2 outline-none ${isMedicalExpired(studentForm.medicalCertificateExpiry) ? 'border-red-300 bg-red-50 focus:ring-red-500' : 'focus:ring-primary-500'}`} value={studentForm.medicalCertificateExpiry} onChange={e => setStudentForm({...studentForm, medicalCertificateExpiry: e.target.value})} disabled={isGuardian} /></div>
                                        
                                        {/* NOVO CAMPO: POSIÇÕES DE JOGO */}
                                        <div className="pt-2">
                                            <label className="block text-xs font-black text-gray-400 uppercase mb-2 tracking-widest">Posições de Jogo</label>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {positionsList.map(pos => (
                                                    <label key={pos} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-all ${studentForm.positions?.includes(pos) ? 'bg-primary-50 border-primary-500 ring-1 ring-primary-500/20' : 'bg-gray-50 border-gray-100 hover:bg-white'}`}>
                                                        <input 
                                                            type="checkbox" 
                                                            className="rounded text-primary-600 w-4 h-4" 
                                                            checked={studentForm.positions?.includes(pos)} 
                                                            onChange={() => togglePositionSelection(pos)}
                                                            disabled={isGuardian}
                                                        />
                                                        <span className={`text-[10px] font-bold ${studentForm.positions?.includes(pos) ? 'text-primary-700' : 'text-gray-500'}`}>{pos}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold border-b pb-2 flex items-center gap-2"><HeartPulse className="w-4 h-4 text-red-500" /> Responsável</h4>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Nome do Responsável</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" required value={studentForm.guardian.name} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, name: e.target.value}})} disabled={isGuardian} /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">CPF do Responsável (Para PIX e Login)</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" required value={studentForm.guardian.cpf} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, cpf: e.target.value}})} disabled={isGuardian} /></div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-medium text-gray-500 mb-1">Telefone (WhatsApp)</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" required value={studentForm.guardian.phone} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, phone: e.target.value}})} disabled={isGuardian} /></div>
                                            <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label><input type="email" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.guardian.email} onChange={e => setStudentForm({...studentForm, guardian: {...studentForm.guardian, email: e.target.value}})} disabled={isGuardian} /></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-sm font-bold border-b pb-2 flex items-center gap-2"><MapPin className="w-4 h-4 text-green-500" /> Endereço</h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="relative"><label className="block text-xs font-medium text-gray-500 mb-1">CEP</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.address.cep} onChange={e => { const val = e.target.value; setStudentForm({...studentForm, address: {...studentForm.address, cep: val}}); if(val.length >= 8) fetchAddressByCep(val); }} disabled={isGuardian} />{isLoadingCep && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-9 text-primary-500" />}</div>
                                    <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Rua / Avenida</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.address.street} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, street: e.target.value}})} disabled={isGuardian} /></div>
                                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Número</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.address.number} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, number: e.target.value}})} disabled={isGuardian} /></div>
                                    <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Bairro</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.address.district} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, district: e.target.value}})} disabled={isGuardian} /></div>
                                    <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-500 mb-1">Cidade</label><input className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" value={studentForm.address.city} onChange={e => setStudentForm({...studentForm, address: {...studentForm.address, city: e.target.value}})} disabled={isGuardian} /></div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-sm font-bold border-b pb-2 flex items-center gap-2"><FolderCheck className="w-4 h-4 text-orange-500" /> Documentação Obrigatória</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                                    {[ {id:'rg', label:'RG Atleta'}, {id:'cpf', label:'CPF Atleta'}, {id:'medical', label:'Atestado'}, {id:'address', label:'Endereço'}, {id:'school', label:'Escolar'} ].map(doc => {
                                        const val = studentForm.documents[doc.id] || { delivered: false, isDigital: false };
                                        return (
                                            <div key={doc.id} className={`p-3 rounded-xl border transition-all ${val.delivered ? 'bg-green-50 border-green-200 shadow-inner' : 'bg-orange-50 border-orange-200'}`}>
                                                <p className="text-[10px] font-black uppercase text-gray-500 mb-2 truncate">{doc.label}</p>
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={val.delivered} onChange={e => updateDoc(doc.id, 'delivered', e.target.checked)} className="rounded text-green-600" disabled={isGuardian} /><span className="text-xs font-bold text-gray-700">Entregue</span></label>
                                                    {val.delivered && (<label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={val.isDigital} onChange={e => updateDoc(doc.id, 'isDigital', e.target.checked)} className="rounded text-blue-600" disabled={isGuardian} /><span className="text-[10px] text-gray-500">Formato Digital</span></label>)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            ) : activeTab === 'FINANCE' ? (
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    <div className="w-full md:w-80 border-r bg-gray-50 p-4 md:p-6 space-y-6">
                        <div className="bg-white p-4 rounded-xl border shadow-sm space-y-1">
                             <p className="text-xs font-bold text-gray-500 uppercase">Mensalidades em Aberto</p>
                             <h4 className="text-2xl font-black text-red-600">{studentTransactions.filter(t => t.status === PaymentStatus.PENDING).length}</h4>
                        </div>
                        <div className="bg-white p-4 rounded-xl border shadow-sm space-y-1">
                             <p className="text-xs font-bold text-gray-500 uppercase">Total Selecionado</p>
                             <h4 className="text-2xl font-black text-primary-600">R$ {selectedTotal.toFixed(2)}</h4>
                        </div>
                        {selectedFinanceIds.size > 0 && (
                            <div className="space-y-3">
                                <button onClick={() => initiatePixPayment()} disabled={pixLoading} className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-black shadow-lg shadow-primary-200 transition-all flex items-center justify-center gap-3">
                                    {pixLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <QrCode className="w-6 h-6" />} PAGAR COM PIX
                                </button>
                                {!isGuardian && (
                                    <button onClick={(e) => sendBatchSelectedCharges(e)} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2">
                                        <MessageCircle className="w-5 h-5" /> ENVIAR COBRANÇA (WA)
                                    </button>
                                )}
                            </div>
                        )}
                        {!isGuardian && (
                            <button onClick={() => { setEditingChargeId(null); setManualCharge({ description: '', amount: 0, date: new Date().toISOString().split('T')[0] }); setShowChargeModal(true); }} className="w-full py-3 bg-white text-gray-700 border border-gray-300 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                                <PlusCircle className="w-5 h-5" /> Lançar Taxa / Avulso
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 md:p-6">
                         <div className="space-y-3">
                             {studentTransactions.map(tx => {
                                 const isOverdue = tx.date < todayStr && tx.status === PaymentStatus.PENDING;
                                 const isCancelled = tx.status === PaymentStatus.CANCELLED;
                                 const isSelected = selectedFinanceIds.has(tx.id);
                                 return (
                                     <div key={tx.id} onClick={() => tx.status === PaymentStatus.PENDING && toggleFinanceSelection(tx.id)} className={`group relative flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${tx.status === PaymentStatus.PAID || isCancelled ? 'bg-gray-50 opacity-70' : isSelected ? 'bg-primary-50 border-primary-500 ring-2 ring-primary-500/20' : isOverdue ? 'bg-red-50 border-red-200' : 'bg-white hover:border-primary-300'}`}>
                                         <div className="flex items-center gap-4">
                                             <div className={`p-2 rounded-lg ${tx.status === PaymentStatus.PAID ? 'bg-green-100 text-green-600' : isCancelled ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-400'}`}>
                                                 {isSelected ? <CheckSquare className="w-6 h-6 text-primary-600" /> : tx.status === PaymentStatus.PAID ? <CheckCircle className="w-6 h-6" /> : isCancelled ? <XCircle className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                                             </div>
                                             <div>
                                                 <p className="font-bold text-gray-900">{tx.description}</p>
                                                 <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                     <span className="flex items-center gap-1 font-bold"><Calendar className="w-3 h-3" /> Venc.: {formatDate(tx.date)}</span>
                                                     {tx.status === PaymentStatus.PAID && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-black uppercase text-[9px]">Pago</span>}
                                                     {isCancelled && <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-black uppercase text-[9px]">Cancelado</span>}
                                                     {isOverdue && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-black uppercase text-[9px]">Atrasado</span>}
                                                 </div>
                                             </div>
                                         </div>
                                         <div className="text-right flex items-center gap-4">
                                              <div className={`font-black text-lg ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>R$ {tx.amount.toFixed(2)}</div>
                                              {!isGuardian && tx.status === PaymentStatus.PENDING && (
                                                  <div className="flex items-center gap-1 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                      <button onClick={(e) => { e.stopPropagation(); handlePayTransaction(tx.id, PaymentMethod.CASH); }} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm" title="Dar Baixa (Dinheiro)"><CashIcon className="w-4 h-4" /></button>
                                                      <button onClick={(e) => { e.stopPropagation(); sendChargeMessage(tx); }} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 border border-green-200" title="Enviar cobrança via WhatsApp"><Send className="w-4 h-4" /></button>
                                                      <button onClick={(e) => { e.stopPropagation(); handleOpenEditCharge(e, tx); }} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200" title="Editar Cobrança"><Edit className="w-4 h-4" /></button>
                                                      <button onClick={(e) => { e.stopPropagation(); handleCancelTransaction(tx); }} className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300" title="Cancelar Cobrança"><Ban className="w-4 h-4" /></button>
                                                  </div>
                                              )}
                                              {tx.status === PaymentStatus.PENDING && isGuardian && tx.paymentLink && (
                                                  <button onClick={(e) => { e.stopPropagation(); copyPixCode(); }} className="p-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 border border-primary-200" title="Pagar agora"><QrCode className="w-4 h-4" /></button>
                                              )}
                                         </div>
                                     </div>
                                 );
                             })}
                             {studentTransactions.length === 0 && <div className="p-12 text-center text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200"><Calculator className="w-12 h-12 mx-auto mb-2 opacity-20" /><p>Nenhuma transação financeira registrada.</p></div>}
                         </div>
                    </div>
                </div>
            ) : activeTab === 'ATTENDANCE' ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/30">
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Filtros de Frequência */}
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-bold text-gray-700 uppercase">Filtrar Período:</span>
                          </div>
                          <select 
                            className="border rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            value={attendanceMonth}
                            onChange={(e) => setAttendanceMonth(parseInt(e.target.value))}
                          >
                            <option value={-1}>Todos os Meses</option>
                            {monthsList.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                          <select 
                            className="border rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            value={attendanceYear}
                            onChange={(e) => setAttendanceYear(parseInt(e.target.value))}
                          >
                            {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                             <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between"><div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Presenças</p><h4 className="text-3xl font-black text-green-600">{filteredStudentActivities.filter(a => (a.attendance || []).includes(editingId!)).length}</h4></div><div className="bg-green-50 p-3 rounded-xl"><CheckCircle className="w-6 h-6 text-green-600" /></div></div>
                             <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between"><div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Faltas</p><h4 className="text-3xl font-black text-red-600">{filteredStudentActivities.filter(a => !(a.attendance || []).includes(editingId!) && a.date <= todayStr).length}</h4></div><div className="bg-red-50 p-3 rounded-xl"><XCircle className="w-6 h-6 text-red-600" /></div></div>
                             <div className="bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between"><div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Gols Marcados</p><h4 className="text-3xl font-black text-yellow-500">{filteredStudentActivities.reduce((acc, a) => acc + (a.scorers?.filter(s => s === editingId).length || 0), 0)}</h4></div><div className="bg-yellow-50 p-3 rounded-xl"><Medal className="w-6 h-6 text-yellow-600" /></div></div>
                        </div>

                        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                            <div className="p-4 border-b bg-gray-50 flex items-center justify-between font-bold text-gray-700">
                                <div className="flex items-center gap-2">
                                    <History className="w-4 h-4 text-primary-600" /> Histórico de Atividades
                                </div>
                                {!isGuardian && (
                                    <button 
                                        onClick={handleSendAttendanceReport}
                                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-colors shadow-sm"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" /> ENVIAR P/ RESPONSÁVEL
                                    </button>
                                )}
                            </div>
                            
                            {/* SEÇÃO DE JOGOS */}
                            <div className="px-4 py-2 bg-yellow-50 text-yellow-800 text-[10px] font-black uppercase border-b border-yellow-100 flex items-center gap-2">
                                <Trophy className="w-3 h-3" /> Jogos
                            </div>
                            <div className="divide-y divide-gray-100 border-b">
                                {filteredStudentActivities.filter(a => a.type === 'GAME').map(act => {
                                    const isPresent = (act.attendance || []).includes(editingId!);
                                    const goals = act.scorers?.filter(s => s === editingId).length || 0;
                                    return (
                                        <div key={act.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600"><Trophy className="w-5 h-5" /></div>
                                                <div><p className="font-bold text-sm text-gray-800">{act.title}</p><p className="text-xs text-gray-400">{formatDate(act.date)} • {act.startTime}</p></div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {goals > 0 && <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-[10px] font-black border border-yellow-200">⚽ {goals} GOLS</span>}
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${isPresent ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>{isPresent ? 'Presença' : 'Falta'}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredStudentActivities.filter(a => a.type === 'GAME').length === 0 && (
                                    <div className="p-8 text-center text-gray-400 text-xs italic">Nenhum jogo registrado neste período.</div>
                                )}
                            </div>

                            {/* SEÇÃO DE TREINOS */}
                            <div className="px-4 py-2 bg-blue-50 text-blue-800 text-[10px] font-black uppercase border-b border-blue-100 flex items-center gap-2">
                                <Zap className="w-3 h-3" /> Treinos
                            </div>
                            <div className="divide-y divide-gray-100">
                                {filteredStudentActivities.filter(a => a.type !== 'GAME').map(act => {
                                    const isPresent = (act.attendance || []).includes(editingId!);
                                    return (
                                        <div key={act.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 rounded-lg bg-blue-100 text-blue-600"><Zap className="w-5 h-5" /></div>
                                                <div><p className="font-bold text-sm text-gray-800">{act.title}</p><p className="text-xs text-gray-400">{formatDate(act.date)} • {act.startTime}</p></div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${isPresent ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>{isPresent ? 'Presença' : 'Falta'}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredStudentActivities.filter(a => a.type !== 'GAME').length === 0 && (
                                    <div className="p-8 text-center text-gray-400 text-xs italic">Nenhum treino registrado neste período.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/30">
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                            <h4 className="font-bold text-gray-700 flex items-center gap-2">
                                <MessageSquareWarning className="w-5 h-5 text-orange-600" /> Histórico de Comunicados
                            </h4>
                            {!isGuardian && (
                                <button onClick={(e) => handleOpenAddOccurrence(e, students.find(s => s.id === editingId)!)} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-xs font-black transition-colors shadow-sm flex items-center gap-2">
                                    <Plus className="w-4 h-4" /> NOVO REGISTRO
                                </button>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            {studentOccurrences.map(occ => (
                                <div key={occ.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="bg-orange-50 text-orange-700 text-[10px] font-black px-2 py-0.5 rounded uppercase border border-orange-100">Comunicado WA</span>
                                        <span className="text-xs text-gray-400 font-bold flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(occ.date)}</span>
                                    </div>
                                    <p className="text-sm text-gray-700 leading-relaxed italic">"{occ.description}"</p>
                                    <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400 font-medium">
                                        <span>Registrado em: {new Date(occ.createdAt).toLocaleString('pt-BR')}</span>
                                        <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Enviado com sucesso</span>
                                    </div>
                                </div>
                            ))}
                            {studentOccurrences.length === 0 && (
                                <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-100">
                                    <MessageSquareWarning className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>Nenhuma ocorrência registrada para este atleta.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <div className="p-4 md:p-6 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
              <button type="button" onClick={() => { setIsModalOpen(false); stopCamera(); }} className="px-6 py-2.5 text-gray-500 font-bold hover:bg-gray-200 rounded-xl transition-colors">Fechar</button>
              {!isGuardian && activeTab === 'DETAILS' && (<button type="submit" form="student-form" className="px-10 py-2.5 bg-primary-600 text-white rounded-xl font-black shadow-lg shadow-primary-200 hover:bg-primary-700 transition-all">SALVAR ALTERAÇÕES</button>)}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PIX - MERCADO PAGO */}
      {showPixModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
             <div className="bg-white rounded-3xl shadow-2xl w-full max-sm overflow-hidden animate-in zoom-in duration-300">
                <div className="bg-primary-600 p-6 text-white text-center">
                    <QrCode className="w-12 h-12 mx-auto mb-3 opacity-80" />
                    <h3 className="text-xl font-black uppercase tracking-tighter">Pagamento Instantâneo</h3>
                    <p className="text-primary-100 text-sm opacity-80">Aponte a câmera para o QR Code</p>
                </div>
                
                <div className="p-8 text-center space-y-6">
                    {pixLoading ? (
                        <div className="py-12 flex flex-col items-center gap-4"><Loader2 className="w-12 h-12 text-primary-600 animate-spin" /><p className="text-gray-500 font-bold animate-pulse">Gerando seu QR Code...</p></div>
                    ) : pixData ? (
                        <>
                           <div className="relative group mx-auto w-fit p-3 bg-gray-50 rounded-2xl border-2 border-primary-100">
                               <img src={`data:image/jpeg;base64,${pixData.qrCodeBase64}`} alt="QR Code" className="w-56 h-56 mx-auto rounded-lg shadow-sm" />
                               <div className="absolute inset-0 group-hover:bg-primary-600/5 transition-colors pointer-events-none rounded-lg" />
                           </div>
                           <div className="space-y-3">
                               <button onClick={copyPixCode} className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-all active:scale-95"><Copy className="w-4 h-4" /> Copiar Código PIX</button>
                               <p className="text-[10px] text-gray-400 font-medium px-4">Após o pagamento, o sistema identificará automaticamente e dará baixa em sua mensalidade em alguns instantes.</p>
                           </div>
                        </>
                    ) : (
                        <div className="py-12 text-red-500 font-bold"><XCircle className="w-12 h-12 mx-auto mb-2" /> Falha ao gerar pagamento.</div>
                    )}
                </div>
                
                <div className="p-4 bg-gray-50 border-t flex justify-center">
                    <button onClick={() => setShowPixModal(false)} className="text-gray-500 font-black text-xs hover:text-gray-700 transition-colors uppercase tracking-widest">Cancelar e Fechar</button>
                </div>
             </div>
        </div>
      )}

      {/* MODAL COBRANÇA AVULSA */}
      {showChargeModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-sm p-6 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter">{editingChargeId ? 'Editar Cobrança' : 'Lançar Cobrança'}</h3>
                <button onClick={() => { setShowChargeModal(false); setEditingChargeId(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
            </div>
            <form onSubmit={handleSaveManualCharge} className="space-y-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label><input required className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Ex: Uniforme, Taxa de Torneio..." value={manualCharge.description} onChange={e => setManualCharge({...manualCharge, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor (R$)</label><input required type="number" step="0.01" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-primary-500 outline-none font-bold" placeholder="0,00" value={manualCharge.amount || ''} onChange={e => setManualCharge({...manualCharge, amount: parseFloat(e.target.value) || 0})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vencimento</label><input required type="date" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-primary-500 outline-none" value={manualCharge.date} onChange={e => setManualCharge({...manualCharge, date: e.target.value})} /></div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => { setShowChargeModal(false); setEditingChargeId(null); }} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                  <button type="submit" className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-black hover:bg-black transition-all uppercase tracking-tight">{editingChargeId ? 'SALVAR' : 'LANÇAR'}</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NOVA OCORRÊNCIA */}
      {showOccurrenceModal && (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-sm p-6 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                    <MessageSquareWarning className="text-orange-600 w-5 h-5" /> Registrar Ocorrência
                </h3>
                <button onClick={() => setShowOccurrenceModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
            </div>
            <form onSubmit={handleSaveOccurrence} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição do Ocorrido</label>
                    <textarea required rows={4} className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none text-sm" 
                        placeholder="Descreva o comportamento, atraso ou aviso para o responsável..."
                        value={newOccurrence.description} onChange={e => setNewOccurrence({...newOccurrence, description: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data da Ocorrência</label>
                    <input required type="date" className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none" 
                        value={newOccurrence.date} onChange={e => setNewOccurrence({...newOccurrence, date: e.target.value})} />
                </div>
                <p className="text-[10px] text-gray-400 italic">Ao salvar, uma mensagem será enviada automaticamente para o WhatsApp do responsável cadastrado.</p>
                <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setShowOccurrenceModal(false)} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                    <button type="submit" className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-black hover:bg-orange-700 transition-all shadow-lg shadow-orange-100">SALVAR E ENVIAR</button>
                </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
