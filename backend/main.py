from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import pipeline, questions, tags, llm, raw_responses, scan, exam


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ALI_ACA API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api"
app.include_router(pipeline.router, prefix=api_prefix)
app.include_router(questions.router, prefix=api_prefix)
app.include_router(tags.router, prefix=api_prefix)
app.include_router(llm.router, prefix="/api/llm")
app.include_router(llm.settings_router, prefix=api_prefix)
app.include_router(raw_responses.router, prefix=api_prefix)
app.include_router(scan.router, prefix=api_prefix)
app.include_router(exam.router, prefix=api_prefix)


@app.get("/api/health")
def health():
    return {"status": "ok"}
