#!/usr/bin/env bash
set -euo pipefail
# Optional reproduction tool; ordinary pnpm builds consume the verified Wasm.
# Requires the pinned Emscripten SDK, GCC/G++, Python3, curl, GNU make and sha256sum.
collation_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
: "${COLLATION_EMSDK:?Set COLLATION_EMSDK to an installed Emscripten 3.1.74 SDK}"
source "$COLLATION_EMSDK/emsdk_env.sh"
emcc --version | head -1 | rg '3\.1\.74'
collation_build=$(mktemp -d "${TMPDIR:-/tmp}/task8-collation-rebuild.XXXXXX")
trap 'rm -rf -- "$collation_build"' EXIT
mkdir -p "$collation_build/source" "$collation_build/native" "$collation_build/wasm/lib" "$collation_build/data"
python3 - "$collation_root/provenance.json" "$collation_build" <<'PY'
import base64, hashlib, io, json, pathlib, sys, tarfile, urllib.request
manifest=json.loads(pathlib.Path(sys.argv[1]).read_text())
output=pathlib.Path(sys.argv[2]); revision=manifest['icuRevision']
base=f'https://chromium.googlesource.com/chromium/deps/icu/+/{revision}'
urls={'sourceArchive':f'https://chromium.googlesource.com/chromium/deps/icu/+archive/{revision}/source.tar.gz','chromiumData':base+'/common/icudtl.dat?format=TEXT'}
for name,url in urls.items():
    data=urllib.request.urlopen(url).read()
    if name=='chromiumData': data=base64.b64decode(data)
    if name=='sourceArchive':
        tree=hashlib.sha256()
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
            for member in sorted(archive.getmembers(),key=lambda member:member.name):
                if pathlib.PurePosixPath(member.name).is_absolute() or '..' in pathlib.PurePosixPath(member.name).parts: raise RuntimeError('Unsafe source path')
                if member.isdir():continue
                if member.isfile():content=archive.extractfile(member).read()
                elif member.issym() or member.islnk():
                    if pathlib.PurePosixPath(member.linkname).is_absolute() or '..' in pathlib.PurePosixPath(member.linkname).parts:raise RuntimeError('Unsafe source link')
                    content=member.linkname.encode()
                else:raise RuntimeError('Unsupported source entry')
                tree.update(member.name.encode()+b'\0'+hashlib.sha256(content).digest())
        if tree.hexdigest()!=manifest['files'][name]['canonicalSha256']:raise RuntimeError('Upstream source content changed')
    elif hashlib.sha256(data).hexdigest()!=manifest['files'][name]['sha256']: raise RuntimeError('Upstream input hash changed: '+name)
    (output/(name+('.dat' if name=='chromiumData' else '.bin'))).write_bytes(data)
PY
tar -xzf "$collation_build/sourceArchive.bin" -C "$collation_build/source"
cd "$collation_build/native"
# Build host data tools with native compilers rather than the SDK's cross tools.
CC=gcc CXX=g++ AR=ar RANLIB=ranlib "$collation_build/source/configure" --enable-static --disable-shared --disable-tests --disable-samples --disable-extras --disable-icuio
make -j4
python3 - "$collation_root/provenance.json" "$collation_build/items.txt" <<'PY'
import json,pathlib,sys
manifest=json.loads(pathlib.Path(sys.argv[1]).read_text());pathlib.Path(sys.argv[2]).write_text('\n'.join(manifest['subsetItems'])+'\n')
PY
bin/icupkg --auto_toc_prefix --ignore-deps -x 'coll/*' -d "$collation_build/data" "$collation_build/chromiumData.dat"
bin/icupkg -tl -a "$collation_build/items.txt" -s "$collation_build/data" new "$collation_build/icudt78l.dat"
python3 - "$collation_root/provenance.json" "$collation_build" <<'PY'
import hashlib,json,pathlib,sys
manifest=json.loads(pathlib.Path(sys.argv[1]).read_text());output=pathlib.Path(sys.argv[2]);data=(output/'icudt78l.dat').read_bytes()
if hashlib.sha256(data).hexdigest()!=manifest['files']['subsetData']['sha256']:raise RuntimeError('Filtered ICU data changed')
with (output/'data.cpp').open('w') as f:
    f.write('extern "C" alignas(16) const unsigned char icudt78_dat[] = {\n')
    for i in range(0,len(data),32):f.write(','.join(str(b) for b in data[i:i+32])+',\n')
    f.write('};\n')
PY
cd "$collation_build/wasm"
collation_flags='-Oz -DUCONFIG_NO_FILE_IO=1 -DUCONFIG_NO_FORMATTING=1 -DUCONFIG_NO_TRANSLITERATION=1 -DUCONFIG_NO_REGULAR_EXPRESSIONS=1 -DUCONFIG_NO_BREAK_ITERATION=1'
emconfigure "$collation_build/source/configure" --host=wasm32-unknown-linux --with-cross-build="$collation_build/native" --enable-static --disable-shared --disable-tests --disable-samples --disable-extras --disable-icuio --with-data-packaging=static AR=emar RANLIB=emranlib CFLAGS="$collation_flags" CXXFLAGS="$collation_flags"
make -C common -j4
make -C i18n -j4
# Intentional flag word splitting: these contain only the constants above.
em++ $collation_flags -I"$collation_build/source/common" -I"$collation_build/source/i18n" "$collation_root/encoder.cpp" "$collation_build/data.cpp" lib/libicui18n.a lib/libicuuc.a -sSTANDALONE_WASM=1 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sEXPORTED_FUNCTIONS='["_init","_allocate","_release","_sort_key","_lower_utf16"]' --no-entry -o "$collation_build/encoder.wasm"
python3 - "$collation_root/provenance.json" "$collation_build/encoder.wasm" <<'PY'
import hashlib,json,pathlib,sys
manifest=json.loads(pathlib.Path(sys.argv[1]).read_text());data=pathlib.Path(sys.argv[2]).read_bytes();actual=hashlib.sha256(data).hexdigest()
if actual!=manifest['files']['encoderWasm']['sha256']:raise RuntimeError('Encoder rebuild hash differs: '+actual)
print('PASS: reproduced pinned encoder Wasm',actual)
PY
