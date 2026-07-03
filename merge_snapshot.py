from pathlib import Path

root = Path(r'c:\Users\timur\VisualStudioCodeProjects\casinobot')
out = root / 'project_snapshot.py'
files = sorted(
    [
        p
        for p in root.rglob('*.py')
        if p.name not in {'merge_snapshot.py', 'project_snapshot.py'}
        and not any(part in {'venv', '.venv', '__pycache__'} for part in p.parts)
    ]
)

with out.open('wb') as fh:
    for p in files:
        rel = p.relative_to(root).as_posix()
        fh.write(b'#######################################################################\n')
        fh.write(f'# FILE: {rel}\n'.encode('utf-8'))
        fh.write(b'#######################################################################\n')
        data = p.read_bytes()
        fh.write(data)
        if not data.endswith(b'\n'):
            fh.write(b'\n')
