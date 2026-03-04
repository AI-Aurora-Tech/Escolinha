
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
  INCOME = 'INCOME', // Mensalidades / Receitas
  EXPENSE = 'EXPENSE', // Contas a pagar / Despesas
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
  dueDay: number; 
  description?: string; 
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
  birthDate: string; 
  rg: string;        
  cpf: string;       
  phone: string;     
  medicalCertificateExpiry: string; 
  photoUrl?: string;
  address: Address; 
  guardian: Guardian;
  planId: string;
  groupIds: string[]; 
  positions: string[];
  active: boolean;
  documents: StudentDocuments;
  createdAt?: string;
}

export interface LineupPosition {
  id: string; // e.g., 'GK', 'LB', 'CB1', etc.
  label: string;
  studentId?: string;
  jerseyNumber?: string;
  x: number; // percentage
  y: number; // percentage
}

export interface LineupReserve {
  studentId: string;
  jerseyNumber?: string;
}

export interface Lineup {
  formation: string; // e.g., '4-4-2'
  starting: LineupPosition[];
  reserves: LineupReserve[];
}

export interface ActivityRSVP {
  id: string;
  activityId: string;
  studentId: string;
  status: 'CONFIRMED' | 'DECLINED';
  createdAt: string;
}

export interface Activity {
  id: string;
  title: string;
  type: 'TRAINING' | 'GAME'; 
  fee?: number; 
  location?: string; 
  presentationTime?: string; 
  opponent?: string; 
  homeScore?: number; 
  awayScore?: number; 
  scorers?: string[]; 
  groupId?: string; 
  participants?: string[]; 
  date: string; 
  startTime: string; 
  endTime: string; 
  description?: string;
  recurrence?: 'weekly' | 'none';
  attendance: string[]; 
  feePayments?: string[]; 
  lineup?: Lineup;
  rsvps?: ActivityRSVP[]; // Novo campo para armazenar confirmações
}

export interface Transaction {
  id: string;
  description: string;
  category?: string; // Novo campo
  amount: number;
  type: TransactionType;
  date: string; // Data de vencimento
  paymentDate?: string; // Novo campo: Data efetiva do pagamento
  status: PaymentStatus;
  studentId?: string; 
  paymentMethod?: PaymentMethod; 
  planId?: string; 
  paymentLink?: string; 
  externalReference?: string; 
  preferenceId?: string; 
  recurrence?: 'NONE' | 'MONTHLY'; // Novo campo
}

export interface Occurrence {
  id: string;
  studentId: string;
  description: string;
  date: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; 
  role: UserRole;
  avatar: string;
  cpf?: string; 
}
