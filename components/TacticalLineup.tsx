
import React, { useState, useEffect, useRef } from 'react';
import { Activity, Student, Lineup, LineupPosition } from '../types';
import { X, Save, Printer, Users, ChevronDown, User as UserIcon, Trash2 } from 'lucide-react';
import { jsPDF } from 'jspdf';

interface TacticalLineupProps {
  activity: Activity;
  students: Student[];
  onSave: (lineup: Lineup) => void;
  onClose: () => void;
}

const FORMATIONS: Record<string, Omit<LineupPosition, 'studentId'>[]> = {
  '4-4-2': [
    { id: 'gk', label: 'GOL', x: 50, y: 90 },
    { id: 'rb', label: 'LD', x: 85, y: 70 },
    { id: 'rcb', label: 'ZAD', x: 65, y: 75 },
    { id: 'lcb', label: 'ZAE', x: 35, y: 75 },
    { id: 'lb', label: 'LE', x: 15, y: 70 },
    { id: 'rm', label: 'MD', x: 80, y: 45 },
    { id: 'rcm', label: 'MC', x: 60, y: 50 },
    { id: 'lcm', label: 'MC', x: 40, y: 50 },
    { id: 'lm', label: 'ME', x: 20, y: 45 },
    { id: 'rs', label: 'ATA', x: 60, y: 20 },
    { id: 'ls', label: 'ATA', x: 40, y: 20 },
  ],
  '4-3-3': [
    { id: 'gk', label: 'GOL', x: 50, y: 90 },
    { id: 'rb', label: 'LD', x: 85, y: 70 },
    { id: 'rcb', label: 'ZAD', x: 65, y: 75 },
    { id: 'lcb', label: 'ZAE', x: 35, y: 75 },
    { id: 'lb', label: 'LE', x: 15, y: 70 },
    { id: 'rcm', label: 'MC', x: 70, y: 50 },
    { id: 'cm', label: 'MC', x: 50, y: 55 },
    { id: 'lcm', label: 'MC', x: 30, y: 50 },
    { id: 'rw', label: 'PD', x: 80, y: 25 },
    { id: 'st', label: 'CA', x: 50, y: 15 },
    { id: 'lw', label: 'PE', x: 20, y: 25 },
  ],
  '3-5-2': [
    { id: 'gk', label: 'GOL', x: 50, y: 90 },
    { id: 'rcb', label: 'ZAD', x: 75, y: 75 },
    { id: 'cb', label: 'ZAC', x: 50, y: 75 },
    { id: 'lcb', label: 'ZAE', x: 25, y: 75 },
    { id: 'rm', label: 'MD', x: 85, y: 50 },
    { id: 'rcm', label: 'MC', x: 65, y: 55 },
    { id: 'cm', label: 'MC', x: 50, y: 55 },
    { id: 'lcm', label: 'MC', x: 35, y: 55 },
    { id: 'lm', label: 'ME', x: 15, y: 50 },
    { id: 'rs', label: 'ATA', x: 65, y: 20 },
    { id: 'ls', label: 'ATA', x: 35, y: 20 },
  ],
  '4-2-3-1': [
    { id: 'gk', label: 'GOL', x: 50, y: 90 },
    { id: 'rb', label: 'LD', x: 85, y: 70 },
    { id: 'rcb', label: 'ZAD', x: 65, y: 75 },
    { id: 'lcb', label: 'ZAE', x: 35, y: 75 },
    { id: 'lb', label: 'LE', x: 15, y: 70 },
    { id: 'rdm', label: 'VOL', x: 60, y: 55 },
    { id: 'ldm', label: 'VOL', x: 40, y: 55 },
    { id: 'ram', label: 'MD', x: 80, y: 35 },
    { id: 'cam', label: 'MC', x: 50, y: 35 },
    { id: 'lam', label: 'ME', x: 20, y: 35 },
    { id: 'st', label: 'CA', x: 50, y: 15 },
  ]
};

export const TacticalLineup: React.FC<TacticalLineupProps> = ({ activity, students, onSave, onClose }) => {
  const [lineup, setLineup] = useState<Lineup>(activity.lineup || {
    formation: '4-4-2',
    starting: FORMATIONS['4-4-2'].map(p => ({ ...p, studentId: undefined })),
    reserves: []
  });

  const [selectedPosId, setSelectedPosId] = useState<string | null>(null);
  const [showPlayerSelect, setShowPlayerSelect] = useState(false);

  const participants = students.filter(s => activity.participants?.includes(s.id));
  
  const usedStudentIds = new Set([
    ...lineup.starting.map(p => p.studentId).filter(Boolean),
    ...lineup.reserves
  ]);

  const availablePlayers = participants
    .filter(s => !usedStudentIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleFormationChange = (formation: string) => {
    const basePositions = FORMATIONS[formation];
    const newStarting = basePositions.map(base => {
      // Try to keep existing players if possible
      const existing = lineup.starting.find(p => p.id === base.id);
      return { ...base, studentId: existing?.studentId };
    });
    setLineup({ ...lineup, formation, starting: newStarting });
  };

  const handleSelectPlayer = (studentId: string) => {
    if (selectedPosId) {
      const newStarting = lineup.starting.map(p => 
        p.id === selectedPosId ? { ...p, studentId } : p
      );
      setLineup({ ...lineup, starting: newStarting });
      setSelectedPosId(null);
      setShowPlayerSelect(false);
    } else {
      // Add to reserves
      setLineup({ ...lineup, reserves: [...lineup.reserves, studentId] });
      setShowPlayerSelect(false);
    }
  };

  const removePlayerFromPosition = (posId: string) => {
    const newStarting = lineup.starting.map(p => 
      p.id === posId ? { ...p, studentId: undefined } : p
    );
    setLineup({ ...lineup, starting: newStarting });
  };

  const removePlayerFromReserves = (studentId: string) => {
    setLineup({ ...lineup, reserves: lineup.reserves.filter(id => id !== studentId) });
  };

  const handlePrint = async () => {
    const doc = new jsPDF();
    const title = `Escalação: ${activity.title}`;
    const date = new Date(activity.date).toLocaleDateString('pt-BR');
    
    // Helper to load image as base64 and crop to circle
    const loadImage = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = Math.min(img.width, img.height);
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('Could not get context');
          
          // Create circular clip
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.clip();
          
          // Draw image centered
          ctx.drawImage(
            img,
            (img.width - size) / 2,
            (img.height - size) / 2,
            size,
            size,
            0,
            0,
            size,
            size
          );
          
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });
    };

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text(title, 14, 20);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Data: ${date} | Adversário: ${activity.opponent || 'N/A'}`, 14, 28);
    doc.text(`Esquema Tático: ${lineup.formation}`, 14, 34);

    // Field Dimensions & Position
    const fieldX = 14;
    const fieldY = 45;
    const fieldW = 110;
    const fieldH = 160;

    // Draw Field Background
    doc.setFillColor(16, 120, 60); // Emerald-700
    doc.rect(fieldX, fieldY, fieldW, fieldH, 'F');
    
    // Draw Field Markings
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.rect(fieldX, fieldY, fieldW, fieldH); // Border
    
    // Mid line
    doc.line(fieldX, fieldY + fieldH/2, fieldX + fieldW, fieldY + fieldH/2);
    // Center circle
    doc.circle(fieldX + fieldW/2, fieldY + fieldH/2, 15);
    
    // Penalty areas
    doc.rect(fieldX + fieldW/6, fieldY, fieldW * 2/3, 20); // Top
    doc.rect(fieldX + fieldW/6, fieldY + fieldH - 20, fieldW * 2/3, 20); // Bottom

    // Draw Players on Field
    for (const pos of lineup.starting) {
      const student = students.find(s => s.id === pos.studentId);
      const px = fieldX + (pos.x / 100) * fieldW;
      const py = fieldY + (pos.y / 100) * fieldH;
      const radius = 6;
      
      // Player Circle Background
      doc.setFillColor(255, 255, 255);
      doc.circle(px, py, radius, 'F');
      
      if (student) {
        // Try to add photo
        if (student.photoUrl) {
          try {
            const base64 = await loadImage(student.photoUrl);
            // Draw circular image
            doc.addImage(base64, 'PNG', px - radius, py - radius, radius * 2, radius * 2);
          } catch (e) {
            console.warn("Could not load student photo for PDF", e);
            // Fallback to label
            doc.setFontSize(7);
            doc.setTextColor(0, 100, 0);
            doc.setFont('helvetica', 'bold');
            doc.text(pos.label, px, py + 1, { align: 'center' });
          }
        } else {
          // Position Label (inside circle)
          doc.setFontSize(7);
          doc.setTextColor(0, 100, 0);
          doc.setFont('helvetica', 'bold');
          doc.text(pos.label, px, py + 1, { align: 'center' });
        }
        
        // Player Circle Border (drawn after image to ensure clean edges)
        doc.setDrawColor(0, 100, 0);
        doc.setLineWidth(0.3);
        doc.circle(px, py, radius, 'S');

        // Student Name (below circle)
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        const displayName = student.name.length > 12 ? student.name.substring(0, 10) + '..' : student.name;
        doc.text(displayName, px, py + 9, { align: 'center' });
      } else {
        // Empty position label
        doc.setDrawColor(0, 100, 0);
        doc.setLineWidth(0.3);
        doc.circle(px, py, radius, 'S');
        
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(pos.label, px, py + 1, { align: 'center' });
      }
    }

    // Reserves Section (to the right of the field)
    const reservesX = 135;
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Reservas:', reservesX, 50);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    lineup.reserves.forEach((id, i) => {
      const student = students.find(s => s.id === id);
      if (student) {
        doc.text(`• ${student.name}`, reservesX, 60 + (i * 7));
      }
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Gerado por Garotos do Martinica', 14, 285);

    doc.save(`Escalacao_${activity.title}_${activity.date}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 overflow-hidden">
      <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col md:flex-row h-full md:h-[90vh] animate-in zoom-in duration-200 overflow-hidden">
        
        {/* Left Side: Field */}
        <div className="flex-[2] bg-emerald-800 p-3 md:p-4 relative overflow-hidden flex flex-col min-h-[400px] md:min-h-0">
          <div className="flex justify-between items-center mb-3 md:mb-4 text-white">
            <h3 className="font-bold text-base md:text-lg flex items-center gap-2">
              <Users className="w-4 h-4 md:w-5 md:h-5" /> Campo Tático
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-xs font-medium opacity-80">Esquema:</span>
              <select 
                className="bg-emerald-900/50 border border-emerald-600 rounded px-2 py-1 text-[10px] md:text-xs outline-none"
                value={lineup.formation}
                onChange={(e) => handleFormationChange(e.target.value)}
              >
                {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Football Field Visual */}
          <div className="flex-1 relative border-2 border-white/40 rounded-lg overflow-hidden bg-emerald-700">
            {/* Field Markings */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-16 border-b-2 border-x-2 border-white/40"></div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-16 border-t-2 border-x-2 border-white/40"></div>
              <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/40"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/40 rounded-full"></div>
            </div>

            {/* Players on Field */}
            {lineup.starting.map((pos) => {
              const student = students.find(s => s.id === pos.studentId);
              return (
                <div 
                  key={pos.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  onClick={() => {
                    setSelectedPosId(pos.id);
                    setShowPlayerSelect(true);
                  }}
                >
                  <div className={`w-11 h-11 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 shadow-lg transition-all overflow-hidden ${student ? 'bg-white border-primary-600 scale-110' : 'bg-emerald-600/50 border-white/30 hover:bg-emerald-500/50'}`}>
                    {student ? (
                      student.photoUrl ? (
                        <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-primary-700 font-bold text-[11px] md:text-[10px]">{pos.label}</span>
                      )
                    ) : (
                      <PlusCircle className="w-5 h-5 md:w-4 md:h-4 text-white/50" />
                    )}
                  </div>
                  <div className="mt-1 px-2 py-0.5 bg-black/60 rounded text-[9px] md:text-[10px] text-white font-medium whitespace-nowrap max-w-[70px] md:max-w-[80px] truncate">
                    {student ? student.name : pos.label}
                  </div>
                  {student && (
                    <button 
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 md:p-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shadow-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePlayerFromPosition(pos.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Controls & Reserves */}
        <div className="w-full md:w-80 bg-gray-50 border-t md:border-t-0 md:border-l flex flex-col h-[40vh] md:h-auto">
          <div className="p-3 md:p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
            <h4 className="font-bold text-gray-800 text-sm md:text-base">Escalação</h4>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5 md:w-6 md:h-6" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Reserves Section */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest">Reservas</h5>
                <button 
                  onClick={() => {
                    setSelectedPosId(null);
                    setShowPlayerSelect(true);
                  }}
                  className="text-[10px] bg-primary-600 text-white px-2 py-1 rounded font-bold hover:bg-primary-700 transition-colors"
                >
                  Adicionar
                </button>
              </div>
              <div className="space-y-2">
                {lineup.reserves.length > 0 ? lineup.reserves
                  .map(id => students.find(s => s.id === id))
                  .filter((s): s is Student => !!s)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(student => {
                  return (
                    <div key={student.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <UserIcon className="w-3 h-3 text-gray-400" />
                        </div>
                        <span className="text-xs font-medium text-gray-700 truncate">{student.name}</span>
                      </div>
                      <button 
                        onClick={() => removePlayerFromReserves(student.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }) : (
                  <div className="text-center py-4 border border-dashed rounded-lg text-gray-400 text-[10px] uppercase font-bold">
                    Nenhum reserva
                  </div>
                )}
              </div>
            </div>

            {/* List of convocados summary */}
            <div>
              <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Convocados ({participants.length})</h5>
              <div className="text-[10px] text-gray-500 space-y-1">
                <div className="flex justify-between"><span>Em campo:</span><span className="font-bold text-emerald-600">{lineup.starting.filter(p => p.studentId).length}</span></div>
                <div className="flex justify-between"><span>No banco:</span><span className="font-bold text-primary-600">{lineup.reserves.length}</span></div>
                <div className="flex justify-between"><span>Não relacionados:</span><span className="font-bold text-orange-600">{availablePlayers.length}</span></div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-3 md:p-4 border-t bg-white space-y-2 sticky bottom-0 z-10">
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              <button 
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-xs md:text-sm font-bold hover:bg-gray-200 transition-colors"
              >
                <Printer className="w-4 h-4" /> <span className="hidden md:inline">Imprimir</span><span className="md:hidden">PDF</span>
              </button>
              <button 
                onClick={() => onSave(lineup)}
                className="flex items-center justify-center gap-2 bg-primary-600 text-white py-2.5 rounded-xl text-xs md:text-sm font-black shadow-lg shadow-primary-100 hover:bg-primary-700 transition-all uppercase tracking-tight"
              >
                <Save className="w-4 h-4" /> Salvar
              </button>
            </div>
          </div>
        </div>

        {/* Player Selection Modal Overlay */}
        {showPlayerSelect && (
          <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-sm p-4 animate-in slide-in-from-bottom-full md:slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-4">
                <h5 className="font-bold text-gray-800">
                  {selectedPosId ? `Selecionar ${lineup.starting.find(p => p.id === selectedPosId)?.label}` : 'Adicionar Reserva'}
                </h5>
                <button onClick={() => setShowPlayerSelect(false)} className="p-2"><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              <div className="max-h-[60vh] md:max-h-64 overflow-y-auto space-y-2 pr-1 pb-4">
                {availablePlayers.length > 0 ? availablePlayers.map(s => (
                  <button 
                    key={s.id}
                    onClick={() => handleSelectPlayer(s.id)}
                    className="w-full text-left p-3.5 hover:bg-primary-50 rounded-xl text-sm font-medium text-gray-700 transition-colors flex items-center gap-3 border border-gray-100 hover:border-primary-100 shadow-sm"
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                      {s.photoUrl ? (
                        <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <span className="truncate">{s.name}</span>
                  </button>
                )) : (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    Nenhum jogador disponível.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PlusCircle = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
);
