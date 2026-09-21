import json, os, subprocess
root='/opt/leon-platform/design-releases/statistics-20260920'
info=json.loads(subprocess.check_output(['docker','inspect','leon-platform-photographer-1']))[0]
assert info['Image']=='sha256:a190cb0bb5ad9019e527bb3c91b9e6c8a16f1ddd8a1f0ca89a09d22cdf5112be', 'Production baseline changed'
env=dict(x.split('=',1) for x in info['Config']['Env'])
key=env.get('PUBLIC_CLERK_PUBLISHABLE_KEY','')
assert key.startswith('pk_'), 'Missing existing public Clerk configuration'
buildenv=os.environ.copy(); buildenv['PUBLIC_CLERK_PUBLISHABLE_KEY']=key
subprocess.run(['docker','build','--build-arg','PUBLIC_CLERK_PUBLISHABLE_KEY','-f',root+'/infra/statistics/Dockerfile','-t','leon-design-prod:statistics-20260920',root],env=buildenv,check=True)
