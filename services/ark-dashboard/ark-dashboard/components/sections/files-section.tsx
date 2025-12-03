'use client';

import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type FileItem, filesService } from '@/lib/services/files';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';

function getFileIcon(file: FileItem, isOpen?: boolean) {
  if (file.type === 'folder') {
    return isOpen ? (
      <FolderOpen className="h-4 w-4 text-amber-500" />
    ) : (
      <Folder className="h-4 w-4 text-amber-500" />
    );
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return <FileJson className="h-4 w-4 text-yellow-500" />;
    case 'yaml':
    case 'yml':
      return <FileCode className="h-4 w-4 text-purple-500" />;
    case 'csv':
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    case 'md':
    case 'txt':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'pdf':
      return <File className="h-4 w-4 text-red-500" />;
    default:
      return <File className="h-4 w-4 text-gray-500" />;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface FileTreeItemProps {
  file: FileItem;
  allFiles: FileItem[];
  selectedFile: FileItem | null;
  onSelect: (file: FileItem) => void;
  level?: number;
}

function FileTreeItem({
  file,
  allFiles,
  selectedFile,
  onSelect,
  level = 0,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedFile?.id === file.id;
  const children = allFiles.filter(f => f.parentId === file.id);
  const hasChildren = children.length > 0;

  if (file.type === 'folder') {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center" style={{ paddingLeft: level * 12 }}>
          <CollapsibleTrigger className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="w-4" />
            )}
          </CollapsibleTrigger>
          <button
            onClick={() => onSelect(file)}
            className={`ml-1 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
              isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
            }`}>
            {getFileIcon(file, isOpen)}
            <span className="truncate">{file.name}</span>
          </button>
        </div>
        <CollapsibleContent>
          {children
            .sort((a, b) => {
              if (a.type === 'folder' && b.type !== 'folder') return -1;
              if (a.type !== 'folder' && b.type === 'folder') return 1;
              return a.name.localeCompare(b.name);
            })
            .map(child => (
              <FileTreeItem
                key={child.id}
                file={child}
                allFiles={allFiles}
                selectedFile={selectedFile}
                onSelect={onSelect}
                level={level + 1}
              />
            ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div className="flex items-center" style={{ paddingLeft: level * 12 }}>
      <span className="w-6" />
      <button
        onClick={() => onSelect(file)}
        className={`ml-1 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
          isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
        }`}>
        {getFileIcon(file)}
        <span className="truncate">{file.name}</span>
      </button>
    </div>
  );
}

function FileDetailPanel({ file }: { file: FileItem }) {
  const handleDownload = () => {
    toast.success('Download Started', {
      description: `Downloading ${file.name}...`,
    });
  };

  const handleDelete = () => {
    toast.success('File Deleted', {
      description: `${file.name} has been deleted`,
    });
  };

  if (file.type === 'folder') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-10 w-10 text-amber-500" />
          <div>
            <h3 className="text-lg font-semibold">{file.name}</h3>
            <p className="text-muted-foreground text-sm">Folder</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-muted-foreground text-sm font-medium">Path</dt>
            <dd className="mt-1 font-mono text-sm">{file.path}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm font-medium">
              Created
            </dt>
            <dd className="mt-1 text-sm">{formatDate(file.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm font-medium">
              Modified
            </dt>
            <dd className="mt-1 text-sm">{formatDate(file.modifiedAt)}</dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          {getFileIcon(file)}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{file.name}</h3>
          <p className="text-muted-foreground text-sm">
            {file.mimeType || 'Unknown type'}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-muted-foreground text-sm font-medium">Path</dt>
          <dd className="mt-1 font-mono text-sm">{file.path}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm font-medium">Size</dt>
          <dd className="mt-1 text-sm">
            {file.size ? filesService.formatSize(file.size) : '-'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm font-medium">Created</dt>
          <dd className="mt-1 text-sm">{formatDate(file.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm font-medium">
            Modified
          </dt>
          <dd className="mt-1 text-sm">{formatDate(file.modifiedAt)}</dd>
        </div>
      </dl>

      <div>
        <h4 className="text-muted-foreground mb-2 text-sm font-medium">
          Preview
        </h4>
        <div className="rounded-lg border bg-gray-50 p-4 dark:bg-gray-900">
          {file.mimeType?.includes('yaml') ||
          file.mimeType?.includes('json') ||
          file.mimeType?.includes('text') ? (
            <pre className="overflow-x-auto font-mono text-xs text-gray-600 dark:text-gray-400">
              {file.name.endsWith('.yaml') || file.name.endsWith('.yml')
                ? `apiVersion: ark.mckinsey.com/v1
kind: Agent
metadata:
  name: ${file.name.replace('.yaml', '')}
spec:
  description: Sample agent configuration
  modelRef:
    name: gpt-4o
  tools:
    - name: search
    - name: calculator`
                : file.name.endsWith('.json')
                  ? JSON.stringify(
                      {
                        name: file.name.replace('.json', ''),
                        version: '1.0.0',
                        data: ['sample', 'content'],
                      },
                      null,
                      2,
                    )
                  : `# ${file.name}\n\nSample content for preview.\nThis is a mockup of the file content.`}
            </pre>
          ) : file.mimeType?.includes('pdf') ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <File className="mr-2 h-8 w-8" />
              PDF Preview not available
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-gray-400">
              No preview available
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
        <Button variant="outline" size="sm" onClick={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

export function FilesSection() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const rootFiles = await filesService.getAll(null);
      const allFiles: FileItem[] = [...rootFiles];

      for (const folder of rootFiles.filter(f => f.type === 'folder')) {
        const children = await filesService.getAll(folder.id);
        allFiles.push(...children);
      }

      setFiles(allFiles);
    } catch (error) {
      console.error('Failed to load files:', error);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = () => {
    toast.info('Upload', {
      description: 'File upload dialog would open here (mockup only)',
    });
  };

  const handleRefresh = () => {
    loadFiles();
    toast.info('Refreshed');
  };

  const rootFiles = files
    .filter(f => f.parentId === null)
    .sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

  if (loading && files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpen />
          </EmptyMedia>
          <EmptyTitle>No Files Yet</EmptyTitle>
        </EmptyHeader>
        <Button onClick={handleUpload}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Files
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleUpload}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r">
          <ScrollArea className="h-full">
            <div className="p-3">
              <div className="mb-2 px-2 text-xs font-medium text-gray-500">
                FILES
              </div>
              {rootFiles.map(file => (
                <FileTreeItem
                  key={file.id}
                  file={file}
                  allFiles={files}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 overflow-auto">
          {selectedFile ? (
            <div className="p-6">
              <FileDetailPanel file={selectedFile} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              Select a file to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
