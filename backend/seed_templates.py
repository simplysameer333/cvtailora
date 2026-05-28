"""
Run once to seed the three prebuilt templates into MongoDB.
Usage: python seed_templates.py
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

PREBUILT = [
    {
        "name": "Clean",
        "type": "prebuilt",
        "preview_image_url": "/template-previews/clean.png",
        "file_path": "templates/prebuilt/clean.docx",
        "description": "Minimal single-column, Arial font, subtle section dividers",
        "placeholders": [
            "{{NAME}}", "{{EMAIL}}", "{{PHONE}}", "{{LINKEDIN}}",
            "{{LOCATION}}", "{{SUMMARY}}", "{{EXPERIENCE}}",
            "{{EDUCATION}}", "{{SKILLS}}", "{{CERTIFICATIONS}}",
        ],
        "created_at": datetime.utcnow(),
    },
    {
        "name": "Modern",
        "type": "prebuilt",
        "preview_image_url": "/template-previews/modern.png",
        "file_path": "templates/prebuilt/modern.docx",
        "description": "Two-column header, accent colour sidebar for skills",
        "placeholders": [
            "{{NAME}}", "{{EMAIL}}", "{{PHONE}}", "{{LINKEDIN}}",
            "{{LOCATION}}", "{{SUMMARY}}", "{{EXPERIENCE}}",
            "{{EDUCATION}}", "{{SKILLS}}", "{{CERTIFICATIONS}}",
        ],
        "created_at": datetime.utcnow(),
    },
    {
        "name": "Executive",
        "type": "prebuilt",
        "preview_image_url": "/template-previews/executive.png",
        "file_path": "templates/prebuilt/executive.docx",
        "description": "Classic serif font, formal layout, suited for senior roles",
        "placeholders": [
            "{{NAME}}", "{{EMAIL}}", "{{PHONE}}", "{{LINKEDIN}}",
            "{{LOCATION}}", "{{SUMMARY}}", "{{EXPERIENCE}}",
            "{{EDUCATION}}", "{{SKILLS}}", "{{CERTIFICATIONS}}",
        ],
        "created_at": datetime.utcnow(),
    },
]


async def seed():
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.tailormycv
    for tmpl in PREBUILT:
        exists = await db.templates.find_one({"name": tmpl["name"], "type": "prebuilt"})
        if not exists:
            await db.templates.insert_one(tmpl)
            print(f"Inserted template: {tmpl['name']}")
        else:
            print(f"Already exists: {tmpl['name']}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
