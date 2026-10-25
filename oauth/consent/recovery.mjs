// Client identity comes exclusively from authenticated Supabase Auth responses.
export const PERMISSIONS = [
 ['spaces:read','Tus espacios y quién está en cada uno'],['tasks:read','Tus tareas'],
 ['calendar:read','Tu calendario'],['schedule:read','Tu horario de trabajo'],
 ['money:read','Tus gastos y presupuestos'],['trips:read','Tus viajes'],
 ['home:read','Tu hogar: garantías y mantenimiento'],['pets:read','Tus mascotas'],
 ['vault:metadata:read','Los datos de la Bóveda (nunca los archivos)'],
 ['tasks:write','Crear y completar tareas'],['calendar:write','Crear eventos'],
 ['money:write','Anotar gastos'],['trips:write','Añadir cosas a un viaje'],
];
const allowed = new Set(PERMISSIONS.map(([id])=>id));
export class Recovery {
 constructor(api) { this.api=api; this.epoch=0; this.busy=false; this.owner=null; this.clients=[]; this.selected=null; }
 cancel() { this.epoch++; this.selected=null; this.clients=[]; }
 async user(expected) {
  const {data,error}=await this.api.auth.getUser();
  if(error||!data?.user?.id||(expected&&data.user.id!==expected)) throw Error('La cuenta cambió o no está autenticada. Vuelve a entrar.');
  return data.user;
 }
 async grants() {
  if(typeof this.api.auth.oauth?.listGrants!=='function') throw Error('Esta página no está disponible ahora. Inténtalo más tarde.');
  const {data,error}=await this.api.auth.oauth.listGrants();
  if(error||!Array.isArray(data)) throw Error('No se pudieron cargar tus asistentes conectados.');
  return data.filter(g=>typeof g?.client?.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(g.client.id));
 }
 async load() {
  this.cancel(); const epoch=this.epoch;
  const user=await this.user(); const clients=await this.grants(); await this.user(user.id);
  if(epoch!==this.epoch) throw Error('Operación cancelada.');
  this.owner=user; this.clients=clients;return {user,clients};
 }
 select(id) { const entry=this.clients.find(g=>g.client.id===id);if(!entry)throw Error('Selecciona una conexión validada de tu cuenta.');if(this.busy)throw Error('Ya hay una confirmación en curso.');this.epoch++;this.selected=entry.client;return entry.client; }
 identity() {return Object.freeze({epoch:this.epoch,userId:this.owner?.id,clientId:this.selected?.id});}
 matches(identity) {return !!identity&&identity.epoch===this.epoch&&identity.userId===this.owner?.id&&identity.clientId===this.selected?.id;}
 async prepare(id) {
  const client=this.select(id),identity=this.identity(),user=this.owner;
  try {
   const exists=await this.existing(identity.userId,id);
   await this.user(identity.userId);
   if(!this.matches(identity))return null;
   return {client,user,identity,exists};
  }catch(error){if(!this.matches(identity))return null;throw error;}
 }
 async existing(userId,clientId) {
  const {data,error}=await this.api.from('mcp_grants').select('id').eq('user_id',userId).eq('client_id',clientId).maybeSingle();
  if(error)throw Error('No se pudieron comprobar los permisos existentes.');return !!data;
 }
 async save(scopes,displayedIdentity) {
  if(this.busy)throw Error('Ya hay una confirmación en curso.');
  if(!this.matches(displayedIdentity))throw Error('La selección cambió. Vuelve a elegir el asistente.');
  if(!this.owner||!this.selected)throw Error('Selecciona una conexión validada.');
  if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!allowed.has(s))||new Set(scopes).size!==scopes.length)throw Error('Selecciona al menos un permiso de la lista.');
  this.busy=true;const epoch=this.epoch,owner=this.owner.id,id=this.selected.id;
  try {
   await this.user(owner);
   const grant=(await this.grants()).find(g=>g.client.id===id);
   if(!grant)throw Error('Esta conexión ya no está autorizada. No se guardó ningún permiso.');
   const exists=await this.existing(owner,id);
   await this.user(owner);
   if(epoch!==this.epoch||!this.matches(displayedIdentity))throw Error('Operación cancelada.');
   if(exists)return {status:'existing'};
   // INSERT, never UPSERT: concurrent confirmations cannot overwrite each other.
   const {error}=await this.api.from('mcp_grants').insert({user_id:owner,client_id:id,client_name:grant.client.name||'Un asistente',client_raw:grant.client,scopes});
   if(error){if(error.code==='23505')return {status:'existing'};throw Error('No se pudieron guardar los permisos.');}
   return {status:'saved'};
  }finally{this.busy=false;}
 }
}
