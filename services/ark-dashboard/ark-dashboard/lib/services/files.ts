export type FileType = 'file' | 'folder';

export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  size?: number;
  mimeType?: string;
  modifiedAt: string;
  createdAt: string;
  path: string;
  parentId: string | null;
  children?: FileItem[];
}

const MOCK_FILES: FileItem[] = [
  {
    id: 'folder-agents',
    name: 'agents',
    type: 'folder',
    modifiedAt: '2025-12-03T10:00:00Z',
    createdAt: '2025-12-01T09:00:00Z',
    path: '/agents',
    parentId: null,
  },
  {
    id: 'folder-prompts',
    name: 'prompts',
    type: 'folder',
    modifiedAt: '2025-12-03T11:30:00Z',
    createdAt: '2025-12-01T09:00:00Z',
    path: '/prompts',
    parentId: null,
  },
  {
    id: 'folder-data',
    name: 'data',
    type: 'folder',
    modifiedAt: '2025-12-02T15:00:00Z',
    createdAt: '2025-12-01T09:00:00Z',
    path: '/data',
    parentId: null,
  },
  {
    id: 'file-readme',
    name: 'README.md',
    type: 'file',
    size: 2048,
    mimeType: 'text/markdown',
    modifiedAt: '2025-12-03T09:00:00Z',
    createdAt: '2025-12-01T09:00:00Z',
    path: '/README.md',
    parentId: null,
  },
  {
    id: 'file-config',
    name: 'config.yaml',
    type: 'file',
    size: 1024,
    mimeType: 'application/yaml',
    modifiedAt: '2025-12-03T08:30:00Z',
    createdAt: '2025-12-01T09:00:00Z',
    path: '/config.yaml',
    parentId: null,
  },
  {
    id: 'file-agent-weather',
    name: 'weather-agent.yaml',
    type: 'file',
    size: 3200,
    mimeType: 'application/yaml',
    modifiedAt: '2025-12-03T10:00:00Z',
    createdAt: '2025-12-02T14:00:00Z',
    path: '/agents/weather-agent.yaml',
    parentId: 'folder-agents',
  },
  {
    id: 'file-agent-code',
    name: 'code-reviewer.yaml',
    type: 'file',
    size: 4100,
    mimeType: 'application/yaml',
    modifiedAt: '2025-12-03T10:00:00Z',
    createdAt: '2025-12-02T14:00:00Z',
    path: '/agents/code-reviewer.yaml',
    parentId: 'folder-agents',
  },
  {
    id: 'file-agent-research',
    name: 'deep-research.yaml',
    type: 'file',
    size: 5600,
    mimeType: 'application/yaml',
    modifiedAt: '2025-12-03T10:00:00Z',
    createdAt: '2025-12-02T14:00:00Z',
    path: '/agents/deep-research.yaml',
    parentId: 'folder-agents',
  },
  {
    id: 'file-prompt-system',
    name: 'system-prompt.txt',
    type: 'file',
    size: 8500,
    mimeType: 'text/plain',
    modifiedAt: '2025-12-03T11:30:00Z',
    createdAt: '2025-12-01T10:00:00Z',
    path: '/prompts/system-prompt.txt',
    parentId: 'folder-prompts',
  },
  {
    id: 'file-prompt-analysis',
    name: 'analysis-template.txt',
    type: 'file',
    size: 3200,
    mimeType: 'text/plain',
    modifiedAt: '2025-12-03T11:00:00Z',
    createdAt: '2025-12-01T10:00:00Z',
    path: '/prompts/analysis-template.txt',
    parentId: 'folder-prompts',
  },
  {
    id: 'file-data-customers',
    name: 'customers.json',
    type: 'file',
    size: 156000,
    mimeType: 'application/json',
    modifiedAt: '2025-12-02T15:00:00Z',
    createdAt: '2025-12-01T12:00:00Z',
    path: '/data/customers.json',
    parentId: 'folder-data',
  },
  {
    id: 'file-data-products',
    name: 'products.csv',
    type: 'file',
    size: 89000,
    mimeType: 'text/csv',
    modifiedAt: '2025-12-02T14:00:00Z',
    createdAt: '2025-12-01T12:00:00Z',
    path: '/data/products.csv',
    parentId: 'folder-data',
  },
  {
    id: 'file-data-report',
    name: 'quarterly-report.pdf',
    type: 'file',
    size: 2450000,
    mimeType: 'application/pdf',
    modifiedAt: '2025-12-02T13:00:00Z',
    createdAt: '2025-12-02T13:00:00Z',
    path: '/data/quarterly-report.pdf',
    parentId: 'folder-data',
  },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const filesService = {
  async getAll(parentId: string | null = null): Promise<FileItem[]> {
    await new Promise(resolve => setTimeout(resolve, 200));
    return MOCK_FILES.filter(f => f.parentId === parentId).sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
  },

  async get(id: string): Promise<FileItem | null> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return MOCK_FILES.find(f => f.id === id) ?? null;
  },

  async getByPath(path: string): Promise<FileItem | null> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return MOCK_FILES.find(f => f.path === path) ?? null;
  },

  async getBreadcrumbs(fileId: string): Promise<FileItem[]> {
    await new Promise(resolve => setTimeout(resolve, 50));
    const breadcrumbs: FileItem[] = [];
    let current = MOCK_FILES.find(f => f.id === fileId);
    while (current) {
      breadcrumbs.unshift(current);
      current = current.parentId
        ? MOCK_FILES.find(f => f.id === current!.parentId)
        : undefined;
    }
    return breadcrumbs;
  },

  formatSize: formatFileSize,
};
