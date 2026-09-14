from __future__ import annotations
import errno
import hashlib
import json
import os
import posixpath
import stat
import sys
import tarfile

def fail(code):
    raise RuntimeError(code)

def limits(value):
    supplied = value if isinstance(value, dict) else {}
    return {
        "maxEntries": max(1, min(int(supplied.get("maxEntries", 200000)), 500000)),
        "maxFileBytes": max(1, int(supplied.get("maxFileBytes", 4 * 1024 * 1024 * 1024))),
        "maxAggregateBytes": max(1, int(supplied.get("maxAggregateBytes", 32 * 1024 * 1024 * 1024))),
        "maxArchiveBytes": max(1, int(supplied.get("maxArchiveBytes", 40 * 1024 * 1024 * 1024))),
    }

def split_relative(root, value):
    root_abs = os.path.abspath(root)
    target = os.path.abspath(os.path.join(root_abs, str(value)))
    if os.path.commonpath((root_abs, target)) != root_abs or target == root_abs:
        fail("archive_manifest_path_escape")
    relative = os.path.relpath(target, root_abs)
    parts = relative.split(os.sep)
    if not parts or any(part in ("", ".", "..") or "\x00" in part for part in parts):
        fail("archive_manifest_path_escape")
    return parts

def digest_descriptor(descriptor, size):
    value = hashlib.sha256()
    position = 0
    while position < size:
        chunk = os.pread(descriptor, min(1024 * 1024, size - position), position)
        if not chunk:
            fail("archive_integrity_short_read")
        value.update(chunk)
        position += len(chunk)
    return "sha256:" + value.hexdigest()

def canonical_manifest(entries):
    material = json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(material).hexdigest()

def source_manifest(payload):
    root = os.path.abspath(str(payload.get("root", "")))
    input_paths = payload.get("inputPaths")
    policy = limits(payload.get("limits"))
    if not root or not isinstance(input_paths, list) or not input_paths:
        fail("archive_manifest_input_required")
    root_flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    root_fd = os.open(root, root_flags)
    entries = []
    names = set()
    aggregate = 0

    def walk(parent_fd, name, relative):
        nonlocal aggregate
        metadata = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        if stat.S_ISLNK(metadata.st_mode):
            fail("archive_manifest_symlink_forbidden")
        if stat.S_ISDIR(metadata.st_mode):
            child_fd = os.open(name, root_flags, dir_fd=parent_fd)
            try:
                for child in sorted(os.listdir(child_fd)):
                    if child in ("", ".", "..") or "\x00" in child:
                        fail("archive_manifest_entry_invalid")
                    walk(child_fd, child, relative + "/" + child)
            finally:
                os.close(child_fd)
            return
        if not stat.S_ISREG(metadata.st_mode):
            fail("archive_manifest_entry_invalid")
        if relative in names:
            fail("archive_manifest_duplicate_entry")
        if len(entries) >= policy["maxEntries"] or metadata.st_size > policy["maxFileBytes"]:
            fail("archive_manifest_capacity_exceeded")
        descriptor = os.open(name, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0), dir_fd=parent_fd)
        try:
            locked = os.fstat(descriptor)
            if not stat.S_ISREG(locked.st_mode) or locked.st_size != metadata.st_size:
                fail("archive_manifest_entry_changed")
            sha256 = digest_descriptor(descriptor, locked.st_size)
        finally:
            os.close(descriptor)
        aggregate += metadata.st_size
        if aggregate > policy["maxAggregateBytes"]:
            fail("archive_manifest_capacity_exceeded")
        names.add(relative)
        entries.append({"path": relative.replace(os.sep, "/"), "mode": format(stat.S_IMODE(metadata.st_mode), "04o"), "bytes": metadata.st_size, "sha256": sha256})

    try:
        for item in input_paths:
            parts = split_relative(root, item)
            opened = []
            current = root_fd
            try:
                for component in parts[:-1]:
                    next_fd = os.open(component, root_flags, dir_fd=current)
                    opened.append(next_fd)
                    current = next_fd
                walk(current, parts[-1], "/".join(parts))
            finally:
                for descriptor in reversed(opened):
                    os.close(descriptor)
    finally:
        os.close(root_fd)
    entries.sort(key=lambda item: item["path"])
    return {"schemaVersion":"vigia.evidence-archive-source-manifest.v1","files":len(entries),"bytes":aggregate,"entries":entries,"manifestDigest":canonical_manifest(entries)}

def clean_member_name(value):
    name = str(value)
    if not name or "\x00" in name or "\\" in name or name.startswith("/"):
        fail("archive_restore_path_invalid")
    normalized = posixpath.normpath(name.rstrip("/"))
    parts = normalized.split("/")
    if normalized in ("", ".", "..") or any(part in ("", ".", "..") for part in parts):
        fail("archive_restore_path_invalid")
    return normalized, parts

def ensure_directories(root_fd, parts):
    flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    opened = []
    current = root_fd
    try:
        for component in parts:
            try:
                os.mkdir(component, 0o700, dir_fd=current)
            except FileExistsError:
                pass
            try:
                next_fd = os.open(component, flags, dir_fd=current)
            except OSError as error:
                if error.errno in (errno.ELOOP, errno.ENOTDIR):
                    fail("archive_restore_directory_invalid")
                raise
            opened.append(next_fd)
            current = next_fd
        return current, opened
    except Exception:
        for descriptor in reversed(opened):
            os.close(descriptor)
        raise

def restore_archive(payload):
    archive_path = os.path.abspath(str(payload.get("archivePath", "")))
    destination = os.path.abspath(str(payload.get("destination", "")))
    expected = payload.get("expectedManifest")
    policy = limits(payload.get("limits"))
    if not isinstance(expected, dict) or expected.get("schemaVersion") != "vigia.evidence-archive-source-manifest.v1" or not isinstance(expected.get("entries"), list):
        fail("archive_restore_expected_manifest_invalid")
    expected_entries = expected["entries"]
    if expected.get("manifestDigest") != canonical_manifest(expected_entries):
        fail("archive_restore_expected_manifest_digest_invalid")
    expected_by_path = {item.get("path"): item for item in expected_entries}
    if len(expected_by_path) != len(expected_entries) or len(expected_entries) > policy["maxEntries"]:
        fail("archive_restore_expected_manifest_invalid")
    root_flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    root_fd = os.open(destination, root_flags)
    archive_fd = os.open(archive_path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    restored = []
    seen_members = set()
    seen_files = set()
    tar_entries = 0
    aggregate = 0
    try:
        if os.listdir(root_fd):
            fail("archive_restore_destination_not_empty")
        before = os.fstat(archive_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size <= 0 or before.st_size > policy["maxArchiveBytes"]:
            fail("archive_restore_archive_invalid")
        archive_hash_before = digest_descriptor(archive_fd, before.st_size)
        duplicate = os.dup(archive_fd)
        os.lseek(duplicate, 0, os.SEEK_SET)
        with os.fdopen(duplicate, "rb", closefd=True) as stream, tarfile.open(fileobj=stream, mode="r:") as archive:
            for member in archive:
                tar_entries += 1
                if tar_entries > policy["maxEntries"] * 3:
                    fail("archive_restore_entry_limit_exceeded")
                name, parts = clean_member_name(member.name)
                if name in seen_members:
                    fail("archive_restore_duplicate_entry")
                seen_members.add(name)
                if member.isdir():
                    if not any(path == name or path.startswith(name + "/") for path in expected_by_path):
                        fail("archive_restore_unexpected_directory")
                    directory_fd, opened = ensure_directories(root_fd, parts)
                    for descriptor in reversed(opened):
                        os.close(descriptor)
                    continue
                if not member.isreg() or member.issym() or member.islnk():
                    fail("archive_restore_unsafe_entry_type")
                expected_entry = expected_by_path.get(name)
                if not expected_entry or name in seen_files:
                    fail("archive_restore_unexpected_file:" + name)
                if member.size != int(expected_entry.get("bytes", -1)) or member.size > policy["maxFileBytes"] or format(member.mode & 0o777, "04o") != expected_entry.get("mode"):
                    fail("archive_restore_metadata_mismatch")
                parent_fd, opened = ensure_directories(root_fd, parts[:-1])
                descriptor = None
                source = archive.extractfile(member)
                if source is None:
                    fail("archive_restore_file_unavailable")
                try:
                    descriptor = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600, dir_fd=parent_fd)
                    value = hashlib.sha256()
                    written = 0
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > member.size:
                            fail("archive_restore_size_mismatch")
                        value.update(chunk)
                        view = memoryview(chunk)
                        while view:
                            view = view[os.write(descriptor, view):]
                    if written != member.size:
                        fail("archive_restore_size_mismatch")
                    os.fsync(descriptor)
                    os.fchmod(descriptor, int(expected_entry["mode"], 8))
                    sha256 = "sha256:" + value.hexdigest()
                    if sha256 != expected_entry.get("sha256"):
                        fail("archive_restore_digest_mismatch")
                finally:
                    source.close()
                    if descriptor is not None:
                        os.close(descriptor)
                    for opened_fd in reversed(opened):
                        os.close(opened_fd)
                aggregate += member.size
                if aggregate > policy["maxAggregateBytes"]:
                    fail("archive_restore_capacity_exceeded")
                seen_files.add(name)
                restored.append({"path":name,"mode":expected_entry["mode"],"bytes":member.size,"sha256":sha256})
        restored.sort(key=lambda item: item["path"])
        if seen_files != set(expected_by_path) or restored != expected_entries:
            fail("archive_restore_manifest_mismatch")
        after = os.fstat(archive_fd)
        archive_hash_after = digest_descriptor(archive_fd, after.st_size)
        if archive_hash_before != archive_hash_after or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns) != (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
            fail("archive_restore_archive_changed")
        restored_digest = canonical_manifest(restored)
        if restored_digest != expected.get("manifestDigest"):
            fail("archive_restore_manifest_digest_mismatch")
        return {"schemaVersion":"vigia.evidence-archive-restore-verification.v1","state":"PASS","archiveSha256":archive_hash_before,"archiveBytes":before.st_size,"archiveEntries":tar_entries,"restoredFiles":len(restored),"restoredBytes":aggregate,"sourceManifestDigest":expected["manifestDigest"],"restoredManifestDigest":restored_digest}
    finally:
        os.close(archive_fd)
        os.close(root_fd)

try:
    if len(sys.argv) != 3 or sys.argv[1] != "--operation":
        fail("archive_integrity_helper_usage")
    raw = sys.stdin.buffer.read(64 * 1024 * 1024 + 1)
    if len(raw) > 64 * 1024 * 1024:
        fail("archive_integrity_input_too_large")
    payload = json.loads(raw.decode("utf-8"))
    result = source_manifest(payload) if sys.argv[2] == "manifest" else restore_archive(payload) if sys.argv[2] == "restore" else fail("archive_integrity_helper_usage")
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
except Exception as error:
    sys.stderr.write(str(error) + "\n")
    raise SystemExit(1)
