#!/usr/bin/env python3
"""
Discover MCP tools in Python files using static analysis.
Uses only Python stdlib - no external dependencies required.
"""

import ast
import json
import sys
import os
from typing import Dict, List, Any


class MCPToolDiscoverer(ast.NodeVisitor):
    """AST visitor to find MCP tool definitions"""
    
    def __init__(self):
        self.tools = []
        self.mcp_var_name = None
        self.imports = {}
        
    def visit_ImportFrom(self, node):
        """Track imports to identify FastMCP usage"""
        if node.module == 'fastmcp':
            for alias in node.names:
                if alias.name == 'FastMCP':
                    self.imports['FastMCP'] = alias.asname or alias.name
        self.generic_visit(node)
        
    def visit_Assign(self, node):
        """Find mcp = FastMCP(...) assignments"""
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            var_name = node.targets[0].id
            if isinstance(node.value, ast.Call):
                if isinstance(node.value.func, ast.Name):
                    if node.value.func.id in self.imports.values():
                        self.mcp_var_name = var_name
                        # Extract server name if provided
                        if node.value.args:
                            if isinstance(node.value.args[0], ast.Constant):
                                self.server_name = node.value.args[0].value
        self.generic_visit(node)
        
    def visit_FunctionDef(self, node):
        """Find functions decorated with @mcp.tool()"""
        for decorator in node.decorator_list:
            is_mcp_tool = False
            tool_config = {}
            
            # Check for @mcp.tool() or @mcp.tool
            if isinstance(decorator, ast.Call):
                if isinstance(decorator.func, ast.Attribute):
                    if (isinstance(decorator.func.value, ast.Name) and 
                        decorator.func.value.id == self.mcp_var_name and
                        decorator.func.attr == 'tool'):
                        is_mcp_tool = True
                        # Extract any config from @mcp.tool(name="...", description="...")
                        for keyword in decorator.keywords:
                            if isinstance(keyword.value, ast.Constant):
                                tool_config[keyword.arg] = keyword.value.value
            elif isinstance(decorator, ast.Attribute):
                if (isinstance(decorator.value, ast.Name) and 
                    decorator.value.id == self.mcp_var_name and
                    decorator.attr == 'tool'):
                    is_mcp_tool = True
                    
            if is_mcp_tool:
                tool_info = self.extract_function_info(node)
                tool_info.update(tool_config)
                self.tools.append(tool_info)
                
        self.generic_visit(node)
        
    def extract_function_info(self, node):
        """Extract function name, parameters, and docstring"""
        info = {
            'name': node.name,
            'parameters': [],
            'return_type': None,
            'docstring': ast.get_docstring(node)
        }
        
        # Extract parameters
        for arg in node.args.args:
            param = {'name': arg.arg}
            if arg.annotation:
                param['type'] = ast.unparse(arg.annotation) if hasattr(ast, 'unparse') else self.unparse_annotation(arg.annotation)
            info['parameters'].append(param)
            
        # Extract return type
        if node.returns:
            info['return_type'] = ast.unparse(node.returns) if hasattr(ast, 'unparse') else self.unparse_annotation(node.returns)
            
        return info
    
    def unparse_annotation(self, annotation):
        """Fallback for Python < 3.9 without ast.unparse"""
        if isinstance(annotation, ast.Name):
            return annotation.id
        elif isinstance(annotation, ast.Constant):
            return repr(annotation.value)
        else:
            return 'Any'


def discover_tools_in_file(filepath):
    """Discover MCP tools in a single Python file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
            
        tree = ast.parse(content)
        discoverer = MCPToolDiscoverer()
        discoverer.visit(tree)
        
        return {
            'success': True,
            'file': filepath,
            'tools': discoverer.tools,
            'uses_fastmcp': bool(discoverer.mcp_var_name),
            'mcp_instance': discoverer.mcp_var_name,
            'server_name': getattr(discoverer, 'server_name', None)
        }
    except SyntaxError as e:
        return {
            'success': False,
            'file': filepath,
            'error': f'Syntax error: {str(e)}',
            'tools': []
        }
    except Exception as e:
        return {
            'success': False,
            'file': filepath,
            'error': str(e),
            'tools': []
        }


def discover_tools_in_directory(dirpath):
    """Discover MCP tools in Python files in root directory only (no recursion)"""
    results = {
        'directory': dirpath,
        'files': [],
        'total_tools': 0,
        'uses_fastmcp': False
    }
    
    # Only check Python files in the root directory
    for file in os.listdir(dirpath):
        if file.endswith('.py'):
            filepath = os.path.join(dirpath, file)
            if os.path.isfile(filepath):
                file_result = discover_tools_in_file(filepath)
                results['files'].append(file_result)
                results['total_tools'] += len(file_result.get('tools', []))
                if file_result.get('uses_fastmcp'):
                    results['uses_fastmcp'] = True
                    
    return results


def discover_project(dirpath):
    """Discover project configuration and type"""
    result = {
        'path': dirpath,
        'exists': os.path.exists(dirpath),
        'is_directory': os.path.isdir(dirpath) if os.path.exists(dirpath) else False,
        'platform': None,
        'project_type': None,
        'project_file': None,
        'project_name': None,
        'project_version': None,
        'has_fastmcp': False,
        'fastmcp_version': None
    }
    
    if not result['exists']:
        return result
        
    if not result['is_directory']:
        return result
    
    # Check for Python project files
    pyproject_path = os.path.join(dirpath, 'pyproject.toml')
    requirements_path = os.path.join(dirpath, 'requirements.txt')
    
    if os.path.exists(pyproject_path):
        result['platform'] = 'python3'
        result['project_type'] = 'pyproject'
        result['project_file'] = pyproject_path
        
        # Parse pyproject.toml
        with open(pyproject_path, 'r') as f:
            content = f.read()
            
            # Extract project name and version using basic parsing
            # Look for [project] section
            import re
            
            # Try to find name in [project] section
            name_match = re.search(r'^\s*name\s*=\s*["\']([^"\']+)["\']', content, re.MULTILINE)
            if name_match:
                result['project_name'] = name_match.group(1)
                
            # Try to find version in [project] section
            version_match = re.search(r'^\s*version\s*=\s*["\']([^"\']+)["\']', content, re.MULTILINE)
            if version_match:
                result['project_version'] = version_match.group(1)
            
            # Check for fastmcp
            if 'fastmcp' in content:
                result['has_fastmcp'] = True
                version_match = re.search(r'fastmcp[>=<~]*([0-9.]+)', content)
                if version_match:
                    result['fastmcp_version'] = version_match.group(1)
                    
    elif os.path.exists(requirements_path):
        result['platform'] = 'python3'
        result['project_type'] = 'requirements'
        result['project_file'] = requirements_path
        
        # Check for fastmcp
        with open(requirements_path, 'r') as f:
            content = f.read()
            if 'fastmcp' in content:
                result['has_fastmcp'] = True
                import re
                version_match = re.search(r'fastmcp[>=<~]*([0-9.]+)', content)
                if version_match:
                    result['fastmcp_version'] = version_match.group(1)
    
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'Usage: discover_tools.py <command> <path>'
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'project':
        if len(sys.argv) < 3:
            print(json.dumps({'error': 'Path required for project discovery'}))
            sys.exit(1)
        path = sys.argv[2]
        result = discover_project(path)
    elif command == 'tools':
        if len(sys.argv) < 3:
            print(json.dumps({'error': 'Path required for tool discovery'}))
            sys.exit(1)
        path = sys.argv[2]
        if os.path.isfile(path):
            result = discover_tools_in_file(path)
        elif os.path.isdir(path):
            result = discover_tools_in_directory(path)
        else:
            result = {'error': f'Path not found: {path}'}
    else:
        result = {'error': f'Unknown command: {command}'}
        
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()