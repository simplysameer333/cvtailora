"""Graph agents — the node-work factories used across both features.

Each factory returns an async NodeRun closure the DAG runner schedules. Agents
are the ONLY things that call the LLM gateway; everything else in the graph
package is pure. CategoryCheckerNode is shared by CV Score and CV Build.
"""
from .category_checker import make_category_checker
from .refiner import make_refiner
from .section_generator import make_section_generator
from .verifier import make_verifier

__all__ = ["make_category_checker", "make_refiner", "make_section_generator", "make_verifier"]
