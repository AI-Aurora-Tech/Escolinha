
-- Habilitar o Realtime para as tabelas do sistema Garotos do Martinica
-- Execute este script no SQL Editor do seu projeto Supabase

begin;
  -- Remove as tabelas se já existirem na publicação para evitar erros de duplicidade
  alter publication supabase_realtime drop table if exists students;
  alter publication supabase_realtime drop table if exists activities;
  alter publication supabase_realtime drop table if exists transactions;
  alter publication supabase_realtime drop table if exists groups;
  alter publication supabase_realtime drop table if exists plans;
  alter publication supabase_realtime drop table if exists app_users;

  -- Adiciona as tabelas à publicação de realtime
  alter publication supabase_realtime add table students;
  alter publication supabase_realtime add table activities;
  alter publication supabase_realtime add table transactions;
  alter publication supabase_realtime add table groups;
  alter publication supabase_realtime add table plans;
  alter publication supabase_realtime add table app_users;
commit;
