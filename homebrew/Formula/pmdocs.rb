# frozen_string_literal: true

class Pmdocs < Formula
  desc "Native CLI for Payload Markdown Docs"
  homepage "https://github.com/valkyrianlabs/payload-markdown-docs"
  url "https://github.com/valkyrianlabs/payload-markdown-docs/archive/refs/tags/v0.18.0.tar.gz"
  sha256 "TODO_REPLACE_WITH_RELEASE_ARCHIVE_SHA256"
  license "MIT"
  head "https://github.com/valkyrianlabs/payload-markdown-docs.git", branch: "main"

  depends_on "cli11" => :build
  depends_on "cmake" => :build
  depends_on "doctest" => :build
  depends_on "meson" => :build
  depends_on "ninja" => :build
  depends_on "nlohmann-json" => :build
  depends_on "pkgconf" => :build
  depends_on "curl"
  depends_on "openssl@3"

  def install
    system "meson", "setup", "build", *std_meson_args
    system "meson", "compile", "-C", "build"
    system "meson", "install", "-C", "build"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pmdocs --version")
    assert_match "pmdocs skill install", shell_output("#{bin}/pmdocs skill install --help")
  end
end
