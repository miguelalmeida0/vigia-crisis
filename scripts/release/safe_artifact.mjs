import { spawn } from 'node:child_process';
import { lstat,mkdir } from 'node:fs/promises';
import path from 'node:path';

const python=process.platform==='win32'?'python':'/usr/bin/python3';
const helperSource=String.raw`from __future__ import annotations
import errno
import os
import secrets
import stat
import sys

def fail(code):
    raise RuntimeError(code)

def relative_target(root, target):
    root_abs = os.path.abspath(root)
    target_abs = os.path.abspath(target)
    if os.path.commonpath((root_abs, target_abs)) != root_abs or target_abs == root_abs:
        fail("release_artifact_path_escape")
    relative = os.path.relpath(target_abs, root_abs)
    parts = relative.split(os.sep)
    if not parts or any(part in ("", ".", "..") for part in parts):
        fail("release_artifact_path_escape")
    return parts[:-1], parts[-1]

def open_parent(root, directories, create):
    flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    opened = []
    try:
        current = os.open(os.path.abspath(root), flags)
        opened.append(current)
        for component in directories:
            try:
                next_fd = os.open(component, flags, dir_fd=current)
            except FileNotFoundError:
                if not create:
                    fail("release_artifact_directory_invalid")
                os.mkdir(component, 0o700, dir_fd=current)
                next_fd = os.open(component, flags, dir_fd=current)
            except OSError as error:
                if error.errno in (errno.ELOOP, errno.ENOTDIR):
                    fail("release_artifact_directory_invalid")
                raise
            opened.append(next_fd)
            current = next_fd
        return current, opened
    except Exception:
        for descriptor in reversed(opened):
            os.close(descriptor)
        raise

def secure_write(root, target, mode_text):
    directories, basename = relative_target(root, target)
    parent_fd, opened = open_parent(root, directories, True)
    temporary = "." + basename + "." + secrets.token_hex(24) + ".tmp"
    descriptor = None
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(temporary, flags, int(mode_text, 8), dir_fd=parent_fd)
        while True:
            chunk = sys.stdin.buffer.read(1024 * 1024)
            if not chunk:
                break
            view = memoryview(chunk)
            while view:
                view = view[os.write(descriptor, view):]
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        os.rename(temporary, basename, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        os.fsync(parent_fd)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            os.unlink(temporary, dir_fd=parent_fd)
        except FileNotFoundError:
            pass
        for opened_fd in reversed(opened):
            os.close(opened_fd)

def secure_read(root, target, max_bytes_text):
    directories, basename = relative_target(root, target)
    parent_fd, opened = open_parent(root, directories, False)
    descriptor = None
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        try:
            descriptor = os.open(basename, flags, dir_fd=parent_fd)
        except OSError as error:
            if error.errno == errno.ELOOP:
                fail("release_artifact_symlink_forbidden")
            raise
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > int(max_bytes_text):
            fail("release_artifact_read_invalid")
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        for opened_fd in reversed(opened):
            os.close(opened_fd)

try:
    if len(sys.argv) != 6 or sys.argv[1] != "--operation":
        fail("release_artifact_helper_usage")
    operation, root, target, option = sys.argv[2:]
    if operation == "write":
        secure_write(root, target, option)
    elif operation == "read":
        secure_read(root, target, option)
    else:
        fail("release_artifact_helper_usage")
except Exception as error:
    sys.stderr.write(str(error) + "\n")
    raise SystemExit(1)
`;

function inside(root,target){const base=path.resolve(root),resolved=path.resolve(target);if(resolved!==base&&!resolved.startsWith(`${base}${path.sep}`))throw new Error(`release_artifact_path_escape:${resolved}`);return{base,resolved};}
export async function verifyDirectoryChain(root,directory,{create=true,mode=0o700}={}){const{base,resolved}=inside(root,directory),relative=path.relative(base,resolved),parts=relative?relative.split(path.sep):[],segments=[];for(const part of parts){segments.push(part);const current=path.join(base,...segments);let metadata=await lstat(current).catch((error)=>error?.code==='ENOENT'?null:Promise.reject(error));if(!metadata&&create){await mkdir(current,{mode});metadata=await lstat(current);}if(!metadata?.isDirectory()||metadata.isSymbolicLink())throw new Error(`release_artifact_directory_invalid:${path.relative(base,current)}`);}return resolved;}
export function artifactHelperArguments(operation,root,file,option){return['-I','-S','-B','-c',helperSource,'--operation',operation,path.resolve(root),file,String(option)];}
function invoke(operation,root,file,option,input=null,maxBytes=128*1024*1024){const{resolved}=inside(root,file);return new Promise((resolve,reject)=>{const child=spawn(python,artifactHelperArguments(operation,root,resolved,option),{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin'}}),stdout=[],stderr=[];let stdoutBytes=0,stderrBytes=0,settled=false;const fail=(error)=>{if(settled)return;settled=true;child.kill('SIGKILL');reject(error);};child.stdout.on('data',(chunk)=>{stdoutBytes+=chunk.length;if(stdoutBytes>maxBytes)return fail(new Error('release_artifact_helper_output_too_large'));stdout.push(chunk);});child.stderr.on('data',(chunk)=>{stderrBytes+=chunk.length;if(stderrBytes<=16_384)stderr.push(chunk);});child.on('error',fail);child.on('close',(code)=>{if(settled)return;settled=true;if(code!==0)return reject(new Error(Buffer.concat(stderr).toString('utf8').trim()||`release_artifact_helper_failed:${code}`));resolve(Buffer.concat(stdout));});if(input===null)child.stdin.end();else child.stdin.end(input);});}
export async function readFileNoFollow(file,{root,maxBytes=128*1024*1024,encoding=null}={}){const bytes=await invoke('read',root,file,maxBytes,null,maxBytes);return encoding?bytes.toString(encoding):bytes;}
export async function atomicWriteNoFollow(file,value,{root,mode=0o600}={}){await invoke('write',root,file,mode.toString(8),value,16_384);}
