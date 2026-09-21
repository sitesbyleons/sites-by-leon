-- Apply after existing demo memberships have been safely detached.
-- Demos are managed through app_admins, never client workspace memberships.
create or replace function prevent_demo_workspace_membership() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from site_connections where workspace_id=new.workspace_id and site_kind='demo') then
    raise exception 'Demo sites cannot be linked to client accounts' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_demo_workspace_membership on workspace_members;
create trigger prevent_demo_workspace_membership
before insert or update of workspace_id on workspace_members
for each row execute function prevent_demo_workspace_membership();

create or replace function prevent_linked_workspace_becoming_demo() returns trigger
language plpgsql as $$
begin
  if new.site_kind='demo' and exists(select 1 from workspace_members where workspace_id=new.workspace_id) then
    raise exception 'Unlink client accounts before classifying a site as a demo' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_linked_workspace_becoming_demo on site_connections;
create trigger prevent_linked_workspace_becoming_demo
before insert or update of site_kind,workspace_id on site_connections
for each row execute function prevent_linked_workspace_becoming_demo();
