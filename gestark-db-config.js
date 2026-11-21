/* Configuración pública de Gestark (NO contiene secretos).
   Se habilita después de autorizar y crear Supabase con RLS y usuarios.
   Es seguro publicar únicamente la URL y la llave sb_publishable_...,
   NUNCA sb_secret_..., service_role ni contraseñas.
*/
window.GestarkDBConfig = Object.freeze({
  enabled: false,
  url: '', // p. ej. https://proyecto.supabase.co
  publishableKey: '' // p. ej. sb_publishable_...
});
