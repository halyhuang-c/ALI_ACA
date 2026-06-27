from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    Float,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from database import Base


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String, unique=True, nullable=False)
    path = Column(String, nullable=False)
    status = Column(String, default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    raw_extract_response = Column(JSON, nullable=True)
    extract_model = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    questions = relationship("Question", back_populates="image", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=True)
    question_type = Column(String, nullable=True)
    correct_answer = Column(String, nullable=True)
    category = Column(String, nullable=True)
    subcategory = Column(String, nullable=True)
    norm_text = Column(Text, nullable=True)
    dedup_hash = Column(String, index=True, nullable=True)
    is_duplicate = Column(Boolean, default=False, nullable=False)
    duplicate_of_id = Column(Integer, ForeignKey("questions.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    image = relationship("Image", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False, cascade="all, delete-orphan")
    duplicate_of = relationship("Question", remote_side="Question.id", foreign_keys=[duplicate_of_id])
    tag_links = relationship("QuestionTag", back_populates="question", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"), unique=True, nullable=False)
    answer = Column(String, nullable=True)
    explanation = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    raw_response = Column(JSON, nullable=True)
    model = Column(String, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    review_status = Column(String, default=None, nullable=True)
    is_reanswered = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    question = relationship("Question", back_populates="answer")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    ref_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    question_links = relationship("QuestionTag", back_populates="tag", cascade="all, delete-orphan")


class QuestionTag(Base):
    __tablename__ = "question_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("question_id", "tag_id", name="uix_question_tag"),
        Index("ix_question_tags_question_id", "question_id"),
    )

    question = relationship("Question", back_populates="tag_links")
    tag = relationship("Tag", back_populates="question_links")


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    step_name = Column(String, unique=True, nullable=False)
    status = Column(String, default="pending", nullable=False)
    total = Column(Integer, default=0, nullable=False)
    current = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


class LLMConfig(Base):
    __tablename__ = "llm_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    base_url = Column(String, nullable=False)
    api_key = Column(String, nullable=False, default="")
    models = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(Text, nullable=True)


class QuestionStat(Base):
    """题目统计：记录被抽中次数，用于降低下次抽中概率"""
    __tablename__ = "question_stats"

    question_id = Column(Integer, ForeignKey("questions.id"), primary_key=True)
    pick_count = Column(Integer, default=0, nullable=False)
    wrong_count = Column(Integer, default=0, nullable=False)
    last_picked_at = Column(DateTime, nullable=True)


class ExamRecord(Base):
    """考试记录"""
    __tablename__ = "exam_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    # 放弃时间：用户主动放弃或考试超时自动作废时写入；为空且 submitted_at 为空表示进行中可恢复
    abandoned_at = Column(DateTime, nullable=True)
    total_questions = Column(Integer, nullable=False)
    correct_count = Column(Integer, default=0, nullable=False)
    wrong_count = Column(Integer, default=0, nullable=False)
    score = Column(Float, default=0, nullable=False)
    passed = Column(Boolean, default=False, nullable=False)
    duration_seconds = Column(Integer, default=0, nullable=False)
    question_ids = Column(JSON, nullable=False)
    answers = Column(JSON, nullable=True)


class WrongQuestion(Base):
    """错题本"""
    __tablename__ = "wrong_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    exam_id = Column(Integer, ForeignKey("exam_records.id"), nullable=True)
    user_answer = Column(String, nullable=True)
    correct_answer = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed = Column(Boolean, default=False, nullable=False)

    question = relationship("Question", lazy="joined")
