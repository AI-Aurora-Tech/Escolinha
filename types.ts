
export enum UserRole {
  ADMIN = 'ADMIN',
  PROFESSOR = 'PROFESSOR',
  RESPONSAVEL = 'RESPONSAVEL',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  LATE = 'LATE',
  CANCELLED = 'CANCELLED',
}

export enum TransactionType {
  INCOME = 'INCOME', // Mensalidades
  EXPENSE = 'EXPENSE', // Contas a pagar
}

export enum PaymentMethod {
  CASH = 'CASH',
  PIX_MERCADO_PAGO = 'PIX_MERCADO_PAGO',
  PIX_MANUAL = 'PIX_MANUAL',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  BOLETO = 'BOLETO',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER'
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  dueDay: number; // Novo campo: Dia de vencimento
  description?: string; // Novo campo: Observação
}

export interface Group {
  id: string;
  name: string;
}

export interface Guardian {
  name: string;
  phone: string;
  email: string;
  cpf: string;
}

export interface Address {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export interface DocumentItem {
    delivered: boolean;
    isDigital: boolean;
}

export interface StudentDocuments {
  rg: boolean | DocumentItem;
  cpf: boolean | DocumentItem;
  medical: boolean | DocumentItem;
  address: boolean | DocumentItem;
  school: boolean | DocumentItem;
}

export interface Student {
  id: string;
  name: string;
  birthDate: string; // Database returns YYYY-MM-DD string
  rg: string;        
  cpf: string;       
  phone: string;     
  medicalCertificateExpiry: string; 
  photoUrl?: string;
  address: Address; 
  guardian: Guardian;
  planId: string;
  groupIds: string[]; // Alterado para array para suportar múltiplos grupos
  active: boolean;
  documents: StudentDocuments;
}

export interface Activity {
  id: string;
  title: string;
  type: 'TRAINING' | 'GAME'; // Novo campo
  fee?: number; // Novo campo: Taxa do jogo
  location?: string; // Novo campo: Local do jogo
  presentationTime?: string; // Novo: Horário de apresentação
  opponent?: string; // Novo: Nome do adversário
  homeScore?: number; // Novo: Placar (Nós)
  awayScore?: number; // Novo: Placar (Eles)
  scorers?: string[]; // Novo: Lista de IDs de quem fez gol
  groupId?: string; // Optional: Activity might be for specific students only
  participants?: string[]; // Optional: List of Student IDs if not a group activity
  date: string; // ISO String
  startTime: string; // "14:00"
  endTime: string; // "15:30"
  description?: string;
  recurrence?: 'weekly' | 'none';
  attendance: string[]; // List of Student IDs present
  feePayments?: string[]; // Novo campo: Lista de IDs que pagaram a taxa
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  date: string; // Data de vencimento ou pagamento
  status: PaymentStatus;
  studentId?: string; // If it's a tuition fee
  paymentMethod?: PaymentMethod; // Novo campo
  planId?: string; // Novo campo opcional para facilitar rastreio
  paymentLink?: string; // Link do Mercado Pago
  externalReference?: string; // ID único enviado ao Mercado Pago
  preferenceId?: string; // ID da preferência do Mercado Pago
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Optional for display, required for auth/creation
  role: UserRole;
  avatar: string;
  cpf?: string; // Para login de responsável
}
