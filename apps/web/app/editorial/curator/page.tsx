// The visual workbench lives outside /admin because Nginx reserves /admin/* for
// the Basic-Auth-protected API. Its data writes still target that protected prefix.
export { default } from '../../admin/editorial/page';
