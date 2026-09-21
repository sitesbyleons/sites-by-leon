export function transformSignin(source, scene) {
 if (/[`]|\$\{/.test(scene)) throw Error('Scene must contain literal HTML only');
 const edits = [
  ['<main class="auth-page auth-page--simple">','<link rel="stylesheet" href="/admin-assets/signin-studio-v1.css"><main class="auth-page auth-page--simple auth-signin">'+scene.trim()],
  ['<span>Sites</span><span>By</span><span>Leon</span>','<img src="/admin-assets/leon-mark-v1.png" alt="" width="36" height="36"><span>sites by leon</span>'],
  ['<h1>Sign in</h1><p>Access your website, support tickets, and billing.</p>','<h1>Your workspace.</h1><p>Manage your site. Pick up where you left off.</p>'],
  ['← Back to leonsites.org','Back to leonsites.org'],
 ];
 let result=source;
 for(const [before,after] of edits){if(result.split(before).length!==2)throw Error('Unexpected sign-in presentation marker');result=result.replace(before,after);}
 let reversed=result;
 for(const [before,after] of [...edits].reverse()) reversed=reversed.replace(after,before);
 if(reversed!==source)throw Error('Presentation patch must be precisely reversible');
 return result;
}
