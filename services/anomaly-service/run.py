#!/usr/bin/env python3
"""Launcher script for anomaly-service.

This service doesn't have a web server, it's just a Kafka consumer.
"""

import sys
import os
from pathlib import Path
import importlib.util
import importlib.machinery

# Setup paths
service_dir = Path(__file__).parent.resolve()
project_root = service_dir.parent.parent

# Add service directory to path (for relative imports to work)
sys.path.insert(0, str(service_dir))
# Add project root to path first (for services.schemas imports)
# This must come AFTER service_dir insert so project_root is at position 0
sys.path.insert(0, str(project_root))

# Change to service directory
os.chdir(str(service_dir))


class ServiceModuleLoader(importlib.machinery.SourceFileLoader):
    """Custom loader that handles module loading from service directory."""
    
    def __init__(self, name, path):
        super().__init__(name, path)
    
    def create_module(self, spec):
        """Create module with proper package setup."""
        module = super().create_module(spec)
        if module is not None and spec.name.startswith("anomaly_service."):
            # Register module in sys.modules before setting package
            sys.modules[spec.name] = module
            # Set package based on module name
            parts = spec.name.split(".")
            if len(parts) > 1:
                # For __init__.py files, package is the module itself
                # For regular modules, package is the parent
                if spec.origin and spec.origin.endswith("__init__.py"):
                    module.__package__ = spec.name
                else:
                    module.__package__ = ".".join(parts[:-1])
        return module


# Create a custom import hook for anomaly_service package
class ServiceImportFinder:
    """Custom finder that maps anomaly_service.* to files in service_dir."""
    
    @staticmethod
    def find_spec(name, path=None, target=None):
        if name.startswith("anomaly_service."):
            parts = name.split(".")
            if len(parts) == 2:
                # e.g., anomaly_service.config
                module_name = parts[1]
                module_file = service_dir / f"{module_name}.py"
                module_dir = service_dir / module_name
                
                if module_file.exists():
                    spec = importlib.util.spec_from_file_location(name, module_file)
                    if spec:
                        spec.loader = ServiceModuleLoader(name, str(module_file))
                    return spec
                elif module_dir.is_dir() and (module_dir / "__init__.py").exists():
                    spec = importlib.util.spec_from_file_location(
                        name, module_dir / "__init__.py"
                    )
                    if spec:
                        spec.loader = ServiceModuleLoader(name, str(module_dir / "__init__.py"))
                        spec.submodule_search_locations = [str(module_dir)]
                    return spec
            elif len(parts) > 2:
                # e.g., anomaly_service.config.thresholds
                parent_dir = service_dir / parts[1]
                if parent_dir.is_dir():
                    module_file = parent_dir / f"{parts[2]}.py"
                    if module_file.exists():
                        spec = importlib.util.spec_from_file_location(name, module_file)
                        if spec:
                            spec.loader = ServiceModuleLoader(name, str(module_file))
                        return spec
        return None


# Install the custom import hook
sys.meta_path.insert(0, ServiceImportFinder)

# Create the package module
import types
fake_pkg = types.ModuleType("anomaly_service")
fake_pkg.__path__ = [str(service_dir)]
sys.modules["anomaly_service"] = fake_pkg

# Load main.py as a module
main_file = service_dir / "main.py"
spec = importlib.util.spec_from_file_location("anomaly_service.main", main_file)

module = importlib.util.module_from_spec(spec)
module.__package__ = "anomaly_service"
module.__name__ = "anomaly_service.main"
module.__file__ = str(main_file)
sys.modules["anomaly_service.main"] = module

 # Execute the module
spec.loader.exec_module(module)

if __name__ == "__main__":
    # Call the main function
    module.main()

